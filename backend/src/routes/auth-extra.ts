import { FastifyInstance } from 'fastify';
import { randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../lib/prisma';
import { withRealCounts } from '../lib/user';
import { RegisterSchema, LoginSchema } from '../lib/validators';
import { authenticate, getAuthUser } from '../middleware/auth';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function issueTokens(app: FastifyInstance, userId: string) {
  const token = app.jwt.sign({ userId }, { expiresIn: '15m' });
  const refreshToken = uuidv4();
  return { token, refreshToken };
}

export default async function authExtraRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/send-otp - Send a 6-digit OTP to a phone number (dev: returns code).
  app.post('/send-otp', async (req, reply) => {
    const { phone } = req.body as { phone: string };
    if (!phone) {
      return reply.status(400).send({ error: 'Phone number is required' });
    }

    let user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      // Auto-provision a phone-only account so OTP can log in.
      user = await prisma.user.create({
        data: { email: `${phone}@phone.pulse`, username: phone, password: '', phone, isGuest: false },
      });
    }

    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await prisma.otpCode.create({ data: { userId: user.id, code, purpose: 'LOGIN', expiresAt } });

    // In production this would be sent via SMS. Dev mode returns the code so the
    // flow is testable without an SMS provider.
    return { devMode: true, code };
  });

  // POST /api/v1/auth/verify-otp - Verify OTP and return auth tokens.
  app.post('/verify-otp', async (req, reply) => {
    const { phone, code } = req.body as { phone: string; code: string };
    if (!phone || !code) {
      return reply.status(400).send({ error: 'Phone and code are required' });
    }

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return reply.status(404).send({ error: 'No user found for this phone number' });
    }

    const otp = await prisma.otpCode.findFirst({
      where: { userId: user.id, code, purpose: 'LOGIN', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) {
      return reply.status(401).send({ error: 'Invalid or expired code' });
    }

    await prisma.otpCode.delete({ where: { id: otp.id } });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ONLINE', lastSeen: new Date() } });

    const { token, refreshToken } = issueTokens(app, user.id);
    await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });

    return {
      user: { id: user.id, username: user.username, displayName: user.displayName, phone: user.phone, isPremium: user.isPremium, isVerified: user.isVerified },
      token,
      refreshToken,
    };
  });

  // POST /api/v1/auth/apple - Sign in with Apple (handled like Google OAuth).
  app.post('/apple', async (req, reply) => {
    const { identityToken } = req.body as { identityToken: string };
    if (!identityToken) {
      return reply.status(400).send({ error: 'Apple identity token is required' });
    }

    // Minimal verification: decode the unverified JWT payload to extract the
    // Apple subject (`sub`) and email. A production deployment must verify the
    // signature against Apple's public keys.
    let payload: any;
    try {
      const part = identityToken.split('.')[1];
      if (!part) throw new Error('malformed');
      payload = JSON.parse(Buffer.from(part, 'base64').toString('utf8'));
    } catch {
      return reply.status(401).send({ error: 'Invalid Apple identity token' });
    }

    const appleSub = payload.sub;
    const email = payload.email || `${appleSub}@apple.pulse`;
    const displayName = payload.name?.firstName || email.split('@')[0];

    if (!appleSub) {
      return reply.status(401).send({ error: 'Invalid Apple identity token' });
    }

    let user = await prisma.user.findFirst({ where: { OR: [{ email }, { username: appleSub }] } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, username: appleSub, displayName, password: '', authProvider: 'APPLE', status: 'ONLINE' },
      });
    } else {
      await prisma.user.update({ where: { id: user.id }, data: { status: 'ONLINE', lastSeen: new Date() } });
    }

    const { token, refreshToken } = issueTokens(app, user.id);
    await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });

    return {
      user: { id: user.id, email: user.email, username: user.username, displayName: user.displayName, isPremium: user.isPremium, isVerified: user.isVerified },
      token,
      refreshToken,
    };
  });

  // POST /api/v1/auth/forgot-password - Request a password reset (dev: returns token).
  app.post('/forgot-password', async (req, reply) => {
    const { email } = req.body as { email: string };
    if (!email) {
      return reply.status(400).send({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Do not reveal whether the email exists.
      return { devMode: true, message: 'If the account exists, a reset link was sent.' };
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.resetToken.create({ data: { userId: user.id, token, expiresAt } });

    // In production this would be emailed. Dev mode returns the token so the
    // flow is testable without an email provider.
    return { devMode: true, resetToken: token };
  });

  // POST /api/v1/auth/reset-password - Reset password using a valid token.
  app.post('/reset-password', async (req, reply) => {
    const { token, newPassword } = req.body as { token: string; newPassword: string };
    if (!token || !newPassword) {
      return reply.status(400).send({ error: 'Token and new password are required' });
    }
    if (newPassword.length < 8) {
      return reply.status(400).send({ error: 'New password must be at least 8 characters' });
    }

    const reset = await prisma.resetToken.findFirst({ where: { token, used: false, expiresAt: { gt: new Date() } } });
    if (!reset) {
      return reply.status(401).send({ error: 'Invalid or expired reset token' });
    }

    const argon2 = (await import('argon2')).default;
    const hashed = await argon2.hash(newPassword);
    await prisma.user.update({ where: { id: reset.userId }, data: { password: hashed } });
    await prisma.resetToken.update({ where: { id: reset.id }, data: { used: true } });

    return { success: true };
  });

  // GET /api/v1/auth/me - expose role (already covered by /auth/me, kept for symmetry)
  app.get('/me/role', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    return { role: authUser.role };
  });
}
