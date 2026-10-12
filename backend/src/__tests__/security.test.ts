import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fastify, { FastifyInstance } from 'fastify';
import jwtPlugin from '@fastify/jwt';

// ---------------------------------------------------------------------------
// Prisma mock shared by the route-level tests below. vi.mock factories are
// hoisted above regular consts, so the mock graph must be created inside
// vi.hoisted().
// ---------------------------------------------------------------------------
const { prismaMock, stripeSessionRetrieve } = vi.hoisted(() => {
  const f = () => vi.fn();
  const prisma: any = {
    user: { findUnique: f(), findFirst: f(), create: f(), update: f(), updateMany: f() },
    otpCode: { create: f(), findFirst: f(), deleteMany: f() },
    refreshToken: { create: f(), findUnique: f(), delete: f(), deleteMany: f() },
    report: { create: f(), findFirst: f(), groupBy: f() },
    notification: { create: f() },
    paymentEvent: { create: f() },
    subscription: { upsert: f(), updateMany: f() },
    coinTransaction: { create: f() },
    $transaction: f(),
    $executeRaw: f(),
  };
  return { prismaMock: prisma, stripeSessionRetrieve: f() };
});
vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../lib/stripe', () => ({
  isStripeConfigured: true,
  stripe: { checkout: { sessions: { create: vi.fn(), retrieve: stripeSessionRetrieve } } },
}));

import { hit, resetLimits } from '../lib/limits';
import { claimPaymentEvent } from '../lib/payments';

const BASE_USER = {
  id: 'u1',
  email: 'u1@example.com',
  username: 'u1',
  displayName: 'U1',
  isPremium: false,
  isVerified: false,
  isLocked: false,
  role: 'USER',
  coins: 0,
};

async function buildApp(module: any, prefix: string): Promise<FastifyInstance> {
  const app = fastify();
  app.decorateRequest('authUser', null);
  await app.register(jwtPlugin, { secret: 'test-secret', sign: { expiresIn: '15m' } });
  await app.register(module, { prefix });
  await app.ready();
  return app;
}

function authHeader(app: FastifyInstance, userId = 'u1'): Record<string, string> {
  return { authorization: `Bearer ${app.jwt.sign({ userId })}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLimits();
});

afterEach(() => {
  delete process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
});

// ---------------------------------------------------------------------------
describe('rate limiter (lib/limits)', () => {
  it('allows up to the limit inside the window and then blocks', () => {
    for (let i = 0; i < 3; i++) expect(hit('k', 3, 60_000)).toBe(true);
    expect(hit('k', 3, 60_000)).toBe(false);
  });

  it('tracks keys independently', () => {
    expect(hit('a', 1, 60_000)).toBe(true);
    expect(hit('a', 1, 60_000)).toBe(false);
    expect(hit('b', 1, 60_000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('payment idempotency (claimPaymentEvent)', () => {
  it('claims a fresh session exactly once', async () => {
    prismaMock.paymentEvent.create.mockResolvedValueOnce({});
    await expect(claimPaymentEvent('cs_1', 'u1', 'COINS', 'pkg')).resolves.toBe(true);

    // Second attempt: unique-violation on PaymentEvent.id -> already granted.
    prismaMock.paymentEvent.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(claimPaymentEvent('cs_1', 'u1', 'COINS', 'pkg')).resolves.toBe(false);
  });

  it('rejects empty ids', async () => {
    await expect(claimPaymentEvent('', 'u1', 'COINS')).resolves.toBe(false);
    expect(prismaMock.paymentEvent.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('OTP flow hardening (C1)', () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({ ...BASE_USER, phone: '+10000000000' });
    prismaMock.user.create.mockResolvedValue({ ...BASE_USER, phone: '+10000000000' });
    prismaMock.otpCode.create.mockResolvedValue({});
    prismaMock.otpCode.deleteMany.mockResolvedValue({});
  });

  it('dev mode returns the code for local testing', async () => {
    const app = await buildApp((await import('../routes/auth-extra')).default, '/auth');
    const res = await app.inject({ method: 'POST', url: '/auth/send-otp', payload: { phone: '+10000000000' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('code');
    await app.close();
  });

  it('production NEVER returns the code in the response (503 without SMS provider)', async () => {
    process.env.NODE_ENV = 'production';
    const app = await buildApp((await import('../routes/auth-extra')).default, '/auth');
    const res = await app.inject({ method: 'POST', url: '/auth/send-otp', payload: { phone: '+10000000000' } });
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toMatch(/\bcode\b/);
    await app.close();
  });

  it('stores the OTP hashed, not in plaintext', async () => {
    const app = await buildApp((await import('../routes/auth-extra')).default, '/auth');
    await app.inject({ method: 'POST', url: '/auth/send-otp', payload: { phone: '+10000000000' } });
    const stored = prismaMock.otpCode.create.mock.calls[0][0].data.code;
    expect(stored).toMatch(/^[a-f0-9]{64}$/); // sha256 hex, not a 6-digit code
    await app.close();
  });

  it('verify-otp rejects wrong codes and accepts the right one', async () => {
    const app = await buildApp((await import('../routes/auth-extra')).default, '/auth');
    const send = await app.inject({ method: 'POST', url: '/auth/send-otp', payload: { phone: '+10000000000' } });
    const code = send.json().code as string;

    // Latest OTP row: return whatever hash send-otp stored.
    const storedHash = prismaMock.otpCode.create.mock.calls[0][0].data.code;
    prismaMock.otpCode.findFirst.mockResolvedValue({ id: 'otp1', code: storedHash });
    prismaMock.user.update.mockResolvedValue({});

    const bad = await app.inject({ method: 'POST', url: '/auth/verify-otp', payload: { phone: '+10000000000', code: '000000' } });
    expect(bad.statusCode).toBe(401);

    const good = await app.inject({ method: 'POST', url: '/auth/verify-otp', payload: { phone: '+10000000000', code } });
    expect(good.statusCode).toBe(200);
    expect(good.json()).toHaveProperty('token');
    await app.close();
  });
});

// ---------------------------------------------------------------------------
describe('report escalation (C6)', () => {
  const VICTIM = '11111111-1111-4111-8111-111111111111';
  beforeEach(() => {
    // Resolve by lookup key: `authenticate` fetches the token user (u1) and
    // the handler fetches the reported target (VICTIM) through the same call.
    prismaMock.user.findUnique.mockImplementation(async (args: any) => ({
      ...BASE_USER,
      id: args?.where?.id ?? BASE_USER.id,
    }));
    prismaMock.report.findFirst.mockResolvedValue(null);
    prismaMock.report.create.mockResolvedValue({ id: 'r1' });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.notification.create.mockResolvedValue({ id: 'n1' });
  });

  it('a single report does NOT lock the accused', async () => {
    prismaMock.report.groupBy.mockResolvedValue([{ reporterId: 'u1' }]);
    const app = await buildApp((await import('../routes/report')).default, '/reports');
    const res = await app.inject({
      method: 'POST',
      url: '/reports',
      headers: authHeader(app),
      payload: { reportedUserId: VICTIM, category: 'NUDITY', description: 'flasher on cam during call' },
    });
    expect(res.statusCode).toBe(200);
    const updates = prismaMock.user.update.mock.calls.map((c: any) => c[0].data);
    expect(updates.some((d: any) => d.isLocked === true)).toBe(false);
    await app.close();
  });

  it('locks only once DISTINCT reporters cross the threshold', async () => {
    prismaMock.report.groupBy.mockResolvedValue([{ reporterId: 'a' }, { reporterId: 'b' }]);
    const app = await buildApp((await import('../routes/report')).default, '/reports');
    const res = await app.inject({
      method: 'POST',
      url: '/reports',
      headers: authHeader(app),
      payload: { reportedUserId: VICTIM, category: 'NUDITY', description: 'explicit content shown on video' },
    });
    expect(res.statusCode).toBe(200);
    const updates = prismaMock.user.update.mock.calls.map((c: any) => c[0].data);
    expect(updates.some((d: any) => d.isLocked === true)).toBe(true);
    await app.close();
  });

  it('dedupes repeat reports from the same reporter (409)', async () => {
    const app = await buildApp((await import('../routes/report')).default, '/reports');
    prismaMock.report.findFirst.mockResolvedValue({ id: 'existing' });
    const res = await app.inject({
      method: 'POST',
      url: '/reports',
      headers: authHeader(app),
      payload: { reportedUserId: VICTIM, category: 'SPAM', description: 'spamming my dms repeatedly' },
    });
    expect(res.statusCode).toBe(409);
    expect(prismaMock.report.create).not.toHaveBeenCalled();
    await app.close();
  });
});

// ---------------------------------------------------------------------------
describe('premium checkout ownership + idempotency (C4)', () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({ ...BASE_USER });
    prismaMock.subscription.upsert.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({});
  });

  it('refuses to grant from another user\'s checkout session', async () => {
    stripeSessionRetrieve.mockResolvedValue({
      payment_status: 'paid',
      status: 'complete',
      metadata: { userId: 'SOMEONE_ELSE', planId: 'gold', period: 'monthly' },
    });
    const app = await buildApp((await import('../routes/premium')).default, '/premium');
    const res = await app.inject({
      method: 'GET',
      url: '/premium/checkout-status?session_id=cs_evil',
      headers: authHeader(app, 'u1'),
    });
    expect(res.statusCode).toBe(403);
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('grants once per session even when polled repeatedly', async () => {
    stripeSessionRetrieve.mockResolvedValue({
      payment_status: 'paid',
      status: 'complete',
      metadata: { userId: 'u1', planId: 'gold', period: 'monthly' },
    });
    // First poll: claim succeeds. Second poll: unique violation -> no grant.
    prismaMock.paymentEvent.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ code: 'P2002' });

    const app = await buildApp((await import('../routes/premium')).default, '/premium');
    const first = await app.inject({
      method: 'GET',
      url: '/premium/checkout-status?session_id=cs_123',
      headers: authHeader(app),
    });
    expect(first.statusCode).toBe(200);
    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(1);

    const second = await app.inject({
      method: 'GET',
      url: '/premium/checkout-status?session_id=cs_123',
      headers: authHeader(app),
    });
    expect(second.statusCode).toBe(200);
    // Still exactly one grant — the repeat poll must not re-extend premium.
    expect(prismaMock.subscription.upsert).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
