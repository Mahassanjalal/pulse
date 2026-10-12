import { FastifyInstance } from 'fastify';
import { randomInt, createHash, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { withRealCounts } from '../lib/user';
import { authenticate, getAuthUser } from '../middleware/auth';
import { verifyAppleIdentityToken } from '../lib/apple-auth';
import { hit } from '../lib/limits';

function issueTokens(app: FastifyInstance, userId: string) {
  const token = app.jwt.sign({ userId }, { expiresIn: '15m' });
  const refreshToken = uuidv4();
  return { token, refreshToken };
}

/**
 * Dev-mode secret reveal: OTP codes and password-reset tokens are returned in
 * the API response ONLY when explicitly allowed. Historically they were
 * returned unconditionally, which allowed full account takeover of any phone
 * or email account in two requests (audit findings C1 and the forgot-password
 * twin). Production must use a real SMS/email provider instead.
 */
function devRevealAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') return process.env.DEV_AUTH_FALLBACK === 'true';
  return process.env.DEV_AUTH_FALLBACK !== 'false';
}

/** OtpCodes are stored hashed — a database leak must not enable takeover. */
function hashOtp(phone: string, code: string): string {
  const salt = process.env.JWT_SECRET || 'pulse-dev-secret';
  return createHash('sha256').update(`${salt}:${phone}:${code}`).digest('hex');
}

function twilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

/** Minimal Twilio SMS send (no SDK dependency). Throws on failure. */
async function sendSmsViaTwilio(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${auth}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Twilio send failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

export default async function authExtraRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/send-otp - Send a 6-digit OTP to a phone number.
  // Rate-limited per phone+IP. In dev (or DEV_AUTH_FALLBACK=true) the code is
  // returned for testability; in production it is sent via Twilio and never
  // returned (503 when no SMS provider is configured).
  app.post('/send-otp', async (req, reply) => {
    const { phone } = req.body as { phone: string };
    if (!phone || typeof phone !== 'string' || phone.length > 30) {
      return reply.status(400).send({ error: 'Phone number is required' });
    }

    const ip = req.ip || 'unknown';
    if (!hit(`otp_send:${ip}`, 10, 60 * 60 * 1000) || !hit(`otp_send_phone:${phone}`, 5, 60 * 60 * 1000)) {
      return reply.status(429).send({ error: 'Too many code requests. Try again later.' });
    }

    let user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      // Auto-provision a phone-only account so OTP can log in. Uses a
      // stable, valid username (phone without leading '+').
      const username = 'ph_' + phone.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
      try {
        user = await prisma.user.create({
          data: { email: `${phone}@phone.pulse`, username, password: '', phone, isGuest: false },
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          // Username collision (different phone, same digits) — fall back to a
          // uuid suffix. Never 500 on a race.
          user = await prisma.user.create({
            data: {
              email: `${phone}@phone.pulse`,
              username: `${username}_${uuidv4().slice(0, 6)}`,
              password: '',
              phone,
              isGuest: false,
            },
          });
        } else {
          throw err;
        }
      }
    }

    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await prisma.otpCode.create({
      data: { userId: user.id, code: hashOtp(phone, code), purpose: 'LOGIN', expiresAt },
    });

    // Purge stale OTP rows so the table can't grow unbounded.
    await prisma.otpCode.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
    });

    if (twilioConfigured()) {
      try {
        await sendSmsViaTwilio(phone, `Your Pulse verification code is ${code}. It expires in 5 minutes.`);
      } catch (err) {
        req.log.error({ err }, 'OTP SMS send failed');
        return reply.status(502).send({ error: 'Failed to send verification code' });
      }
      return { sent: true };
    }

    if (!devRevealAllowed()) {
      req.log.error('OTP requested but no SMS provider configured');
      return reply.status(503).send({ error: 'Verification is temporarily unavailable' });
    }

    // Dev mode: return the code so the flow is testable without SMS.
    return { devMode: true, code };
  });

  // POST /api/v1/auth/verify-otp - Verify OTP and return auth tokens.
  app.post('/verify-otp', async (req, reply) => {
    const { phone, code } = req.body as { phone: string; code: string };
    if (!phone || !code || typeof code !== 'string') {
      return reply.status(400).send({ error: 'Phone and code are required' });
    }

    const ip = req.ip || 'unknown';
    if (!hit(`otp_verify:${ip}`, 20, 60 * 1000) || !hit(`otp_verify_phone:${phone}`, 5, 15 * 60 * 1000)) {
      return reply.status(429).send({ error: 'Too many attempts. Try again later.' });
    }

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return reply.status(404).send({ error: 'No user found for this phone number' });
    }

    const codeHash = hashOtp(phone, code);
    const otp = await prisma.otpCode.findFirst({
      where: { userId: user.id, purpose: 'LOGIN', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    // Constant-time compare against the most recent live code.
    const matches =
      otp &&
      otp.code.length === codeHash.length &&
      timingSafeEqual(Buffer.from(otp.code), Buffer.from(codeHash));

    if (!otp || !matches) {
      return reply.status(401).send({ error: 'Invalid or expired code' });
    }

    // Single-use: remove every outstanding LOGIN code for this user.
    await prisma.otpCode.deleteMany({ where: { userId: user.id, purpose: 'LOGIN' } });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ONLINE', lastSeen: new Date() } });

    const { token, refreshToken } = issueTokens(app, user.id);
    await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });

    return {
      user: { id: user.id, username: user.username, displayName: user.displayName, phone: user.phone, isPremium: user.isPremium, isVerified: user.isVerified },
      token,
      refreshToken,
    };
  });

  // POST /api/v1/auth/apple - Sign in with Apple.
  // The identity token is now fully verified server-side (RS256 signature vs
  // Apple's JWKS + iss/aud/exp) — the old code accepted an unverified JWT
  // payload, allowing account takeover of any Apple-linked user (audit C2).
  app.post('/apple', async (req, reply) => {
    const { identityToken } = req.body as { identityToken: string };
    if (!identityToken) {
      return reply.status(400).send({ error: 'Apple identity token is required' });
    }

    let payload;
    try {
      payload = await verifyAppleIdentityToken(identityToken, process.env.APPLE_CLIENT_ID || '');
    } catch (err: any) {
      req.log.warn({ reason: err?.message }, 'Apple identity verification failed');
      return reply.status(401).send({ error: 'Invalid Apple identity token' });
    }

    const appleSub = payload.sub;
    const email = payload.email || `${appleSub}@apple.pulse`;
    const displayName = payload.name || email.split('@')[0];

    let user = await prisma.user.findFirst({ where: { OR: [{ email }, { username: appleSub }] } });
    if (!user) {
      try {
        user = await prisma.user.create({
          data: { email, username: appleSub, displayName, password: '', authProvider: 'APPLE', status: 'ONLINE' },
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          // Email/username race — resolve the winner and log in with it.
          user = (await prisma.user.findFirst({ where: { OR: [{ email }, { username: appleSub }] } }))!;
        } else {
          throw err;
        }
      }
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

  // POST /api/v1/auth/forgot-password - Request a password reset.
  // The reset token is returned ONLY in dev mode. Previously it was returned
  // unconditionally, letting anyone reset any account by requesting a link
  // for the victim's email (same takeover pattern as the OTP leak).
  app.post('/forgot-password', async (req, reply) => {
    const { email } = req.body as { email: string };
    if (!email) {
      return reply.status(400).send({ error: 'Email is required' });
    }

    const ip = req.ip || 'unknown';
    if (!hit(`forgot_pw:${ip}`, 10, 60 * 60 * 1000)) {
      return reply.status(429).send({ error: 'Too many reset requests. Try again later.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Generic response regardless of existence — never reveal whether an
    // email is registered.
    if (!user) {
      return { message: 'If the account exists, a reset link was sent.' };
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.resetToken.create({ data: { userId: user.id, token, expiresAt } });
    await prisma.resetToken.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });

    if (!devRevealAllowed()) {
      // TODO(production): email the reset link via the configured provider.
      req.log.warn('Password reset requested but no email provider configured');
      return { message: 'If the account exists, a reset link was sent.' };
    }

    // Dev mode: return the token so the flow is testable without email.
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

    const ip = req.ip || 'unknown';
    if (!hit(`reset_pw:${ip}`, 20, 60 * 60 * 1000)) {
      return reply.status(429).send({ error: 'Too many attempts. Try again later.' });
    }

    const reset = await prisma.resetToken.findFirst({ where: { token, used: false, expiresAt: { gt: new Date() } } });
    if (!reset) {
      return reply.status(401).send({ error: 'Invalid or expired reset token' });
    }

    const argon2 = (await import('argon2')).default;
    const hashed = await argon2.hash(newPassword);
    await prisma.user.update({ where: { id: reset.userId }, data: { password: hashed } });
    await prisma.resetToken.update({ where: { id: reset.id }, data: { used: true } });
    // A password change invalidates every active session + refresh token.
    await prisma.refreshToken.deleteMany({ where: { userId: reset.userId } });

    return { success: true };
  });

  // GET /api/v1/auth/me/role - expose role
  app.get('/me/role', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    return { role: authUser.role };
  });
}
