import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { CreateReportSchema } from '../lib/validators';
import { authenticate, getAuthUser } from '../middleware/auth';
import { lockAccount, NUDITY_CATEGORIES } from '../lib/moderation';
import { NotificationService } from '../lib/notifications';
import { hit } from '../lib/limits';

// Safety categories escalate faster: 2 distinct reporters within 24h lock the
// account. Other categories require more reports before any action.
const FAST_LOCK_REPORTS = 2;
const DEFAULT_LOCK_REPORTS = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export default async function reportRoutes(app: FastifyInstance) {
  // POST /api/v1/reports - Create a report.
  //
  // C6 fix: a single unverified report used to INSTANTLY lock the accused
  // account and demand $10 to unlock — trivially weaponizable for griefing
  // (mass-report = instant DoS of any user) and indefensible from a
  // store-review/legal standpoint. Reports now:
  //   1. are rate-limited per reporter,
  //   2. dedupe (one open report per reporter/target pair),
  //   3. only trigger a lock after N DISTINCT reporters within 24h,
  //   4. always leave an admin unlock path (admin route).
  app.post('/', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const data = CreateReportSchema.parse(req.body);
    
    if (data.reportedUserId === authUser.id) {
      return reply.status(400).send({ error: 'Cannot report yourself' });
    }

    if (!hit(`report:${authUser.id}`, 10, 60 * 60 * 1000)) {
      return reply.status(429).send({ error: 'Too many reports. Please try again later.' });
    }

    // The reported user must actually exist.
    const reported = await prisma.user.findUnique({
      where: { id: data.reportedUserId },
      select: { id: true, isLocked: true },
    });
    if (!reported) {
      return reply.status(404).send({ error: 'Reported user not found' });
    }

    // Dedupe: one open report per reporter/target pair in the window. A repeat
    // press of the Report button must not inflate the escalation counter.
    const since = new Date(Date.now() - WINDOW_MS);
    const existing = await prisma.report.findFirst({
      where: {
        reporterId: authUser.id,
        reportedUserId: data.reportedUserId,
        createdAt: { gte: since },
      },
    });
    if (existing) {
      return reply.status(409).send({ error: 'You have already reported this user recently' });
    }
    
    const report = await prisma.report.create({
      data: {
        reporterId: authUser.id,
        reportedUserId: data.reportedUserId,
        category: data.category,
        description: data.description,
      },
    });

    // Escalation: count DISTINCT reporters in the window. Lock only when the
    // threshold is crossed (never on the first-ever report).
    const recent = await prisma.report.groupBy({
      by: ['reporterId'],
      where: { reportedUserId: data.reportedUserId, createdAt: { gte: since } },
    });
    const distinctReporters = recent.length;
    const isSafetyCategory = (NUDITY_CATEGORIES as readonly string[]).includes(data.category);
    const threshold = isSafetyCategory ? FAST_LOCK_REPORTS : DEFAULT_LOCK_REPORTS;

    if (!reported.isLocked && distinctReporters >= threshold) {
      await lockAccount(data.reportedUserId, `Multiple ${isSafetyCategory ? 'safety' : ''} reports (${distinctReporters} in 24h)`);
      await NotificationService.create(
        data.reportedUserId,
        'ACCOUNT_LOCKED',
        'Account Locked',
        'Your account was locked after multiple safety reports. You can appeal from Settings or use the unlock flow.'
      );
      req.log.info({ reportedUserId: data.reportedUserId, distinctReporters }, 'Account locked by report threshold');
    } else if (distinctReporters === 1) {
      // First report: inform the target that a report was filed (no details,
      // no reporter identity) so repeated offenders notice escalation.
      await NotificationService.create(
        data.reportedUserId,
        'REPORT_RECEIVED',
        'Report Filed Against You',
        'A report was filed against you for violating community guidelines. Further violations may restrict your account.'
      );
    }
    
    return { report, underReview: true };
  });

  // GET /api/v1/reports/my-reports - Get user's submitted reports
  app.get('/my-reports', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    
    const reports = await prisma.report.findMany({
      where: { reporterId: authUser.id },
      orderBy: { createdAt: 'desc' },
    });
    
    return { reports };
  });

  // POST /api/v1/reports/:id/cancel - Cancel a pending report
  app.post('/:id/cancel', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const { id } = req.params as { id: string };
    
    await prisma.report.updateMany({
      where: { id, reporterId: authUser.id, status: 'PENDING' },
      data: { status: 'RESOLVED' },
    });
    
    return { success: true };
  });
}