import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser } from '../middleware/auth';
import { stripe, isStripeConfigured } from '../lib/stripe';
import { unlockAccount, UNLOCK_PRICE_USD } from '../lib/moderation';

/**
 * Account-unlock flow. A locked account (e.g. nudity on a call) can be
 * unlocked by paying $10. Mirrors the premium checkout pattern: it creates a
 * one-time Stripe Checkout Session (or grants directly in dev mode).
 */
export default async function moderationRoutes(app: FastifyInstance) {
  // GET /api/v1/moderation/status - Whether the current user is locked and why.
  app.get('/status', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { isLocked: true, lockReason: true, lockUnlockedAt: true },
    });
    return { isLocked: user?.isLocked || false, lockReason: user?.lockReason || null };
  });

  // POST /api/v1/moderation/unlock-checkout - Start a $10 unlock payment.
  app.post('/unlock-checkout', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;

    const user = await prisma.user.findUnique({ where: { id: authUser.id }, select: { isLocked: true } });
    if (!user?.isLocked) {
      return reply.status(400).send({ error: 'Account is not locked' });
    }

    // Dev mode: no Stripe keys -> unlock directly so the flow is testable.
    if (!isStripeConfigured || !stripe) {
      await unlockAccount(authUser.id);
      return { devMode: true, unlocked: true };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: authUser.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: UNLOCK_PRICE_USD * 100,
            product_data: { name: 'Pulse Account Unlock' },
          },
        },
      ],
      metadata: { userId: authUser.id, purpose: 'UNLOCK' },
      success_url: `${process.env.STRIPE_SUCCESS_URL}?unlock=1`,
      cancel_url: `${process.env.STRIPE_CANCEL_URL}`,
    });

    return { sessionId: session.id, url: session.url };
  });

  // GET /api/v1/moderation/unlock-status - Verify a completed unlock payment.
  app.get('/unlock-status', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const { session_id } = req.query as { session_id?: string };

    if (!session_id) {
      return reply.status(400).send({ error: 'session_id required' });
    }
    if (!isStripeConfigured || !stripe) {
      return { devMode: true, isLocked: (await prisma.user.findUnique({ where: { id: authUser.id }, select: { isLocked: true } }))?.isLocked || false };
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    // Only the payer may use this session to unlock (audit C4 ownership).
    if (session.metadata?.userId !== authUser.id || session.metadata?.purpose !== 'UNLOCK') {
      return reply.status(403).send({ error: 'This checkout session belongs to another account' });
    }
    if (session.payment_status === 'paid' || session.status === 'complete') {
      await unlockAccount(authUser.id);
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { isLocked: true },
    });
    return { isLocked: user?.isLocked || false };
  });

  // POST /api/v1/moderation/unlock - Direct unlock with no payment. DEV ONLY:
  // this previously existed in production and let anyone bypass the $10
  // unlock entirely (audit C5).
  app.post('/unlock', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    if (isStripeConfigured) {
      return reply.status(403).send({ error: 'Use /moderation/unlock-checkout to unlock', code: 'PAYMENT_REQUIRED' });
    }
    await unlockAccount(authUser.id);
    return { devMode: true, unlocked: true };
  });
}
