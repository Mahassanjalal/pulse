import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser } from '../middleware/auth';
import { stripe, isStripeConfigured } from '../lib/stripe';
import { NotificationService, isBlocked } from '../lib/notifications';
import { adjustCoins, spendCoins } from '../lib/coins';

// Coin catalog: à-la-carte impulse actions. Prices are intentionally modest
// to encourage repeat spending; these never gate core premium features.
const GIFTS: Record<string, { name: string; cost: number }> = {
  heart: { name: 'Heart', cost: 10 },
  rose: { name: 'Rose', cost: 25 },
  star: { name: 'Star', cost: 50 },
  crown: { name: 'Crown', cost: 100 },
};

const BOOST_COST = 50;
const SUPER_LIKE_COST = 15;
const RE_MATCH_COST = 20;

const COIN_PACKAGES = [
  { id: 'coins_100', name: 'Starter', coins: 100, priceUsd: 0.99, bonus: 0, popular: false },
  { id: 'coins_550', name: 'Popular', coins: 550, priceUsd: 4.99, bonus: 50, popular: true },
  { id: 'coins_1200', name: 'Pro', coins: 1200, priceUsd: 9.99, bonus: 150, popular: false },
  { id: 'coins_3000', name: 'Legend', coins: 3000, priceUsd: 19.99, bonus: 500, popular: false },
];

// Single source of truth for finding a coin package by id, shared by
// create-checkout, checkout-status, and the Stripe webhook.
export function resolveCoinPackage(packageId: string | undefined) {
  if (!packageId) return null;
  return COIN_PACKAGES.find((p) => p.id === packageId) ?? null;
}

export default async function coinRoutes(app: FastifyInstance) {
  // GET /api/v1/coins/packages - Available coin packages for purchase.
  app.get('/packages', async () => {
    return { packages: COIN_PACKAGES };
  });

  // GET /api/v1/coins/transactions - Recent coin ledger entries for the user.
  app.get('/transactions', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const transactions = await prisma.coinTransaction.findMany({
      where: { userId: authUser.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { transactions };
  });

  // POST /api/v1/coins/create-checkout - Start a Stripe one-time payment for
  // coins. Falls back to a direct grant (dev mode) when Stripe is unconfigured.
  app.post('/create-checkout', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const { packageId } = req.body as { packageId: string };

    const pkg = resolveCoinPackage(packageId);
    if (!pkg) {
      return reply.status(400).send({ error: 'Invalid coin package' });
    }

    if (!isStripeConfigured || !stripe) {
      await adjustCoins(authUser.id, pkg.coins + pkg.bonus, 'PURCHASE', pkg.id);
      return { devMode: true, coins: pkg.coins + pkg.bonus };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: authUser.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(pkg.priceUsd * 100),
            product_data: {
              name: `Pulse ${pkg.name} (${pkg.coins + pkg.bonus} coins)`,
              description: `${pkg.coins} coins${pkg.bonus ? ` + ${pkg.bonus} bonus` : ''}`,
            },
          },
        },
      ],
      metadata: { userId: authUser.id, purpose: 'COINS', packageId: pkg.id },
      success_url: `${process.env.STRIPE_SUCCESS_URL}?coins=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.STRIPE_CANCEL_URL}`,
    });

    return { sessionId: session.id, url: session.url };
  });

  // GET /api/v1/coins/checkout-status - Verify a completed coin purchase.
  app.get('/checkout-status', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const { session_id } = req.query as { session_id?: string };

    if (!session_id) {
      return reply.status(400).send({ error: 'session_id required' });
    }
    if (!isStripeConfigured || !stripe) {
      return { devMode: true, coins: authUser.coins };
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    let granted = 0;
    if (session.payment_status === 'paid' || session.status === 'complete') {
      const meta = session.metadata as { packageId?: string } | null;
      const pkg = resolveCoinPackage(meta?.packageId);
      if (pkg) granted = await adjustCoins(authUser.id, pkg.coins + pkg.bonus, 'PURCHASE', pkg.id);
    }

    return { coins: granted, isPremium: authUser.isPremium };
  });

  // POST /api/v1/coins/gift - Send a gift to another user during/after a match.
  app.post('/gift', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const { toUserId, giftId } = req.body as { toUserId: string; giftId: string };

    const gift = GIFTS[giftId];
    if (!gift) {
      return reply.status(400).send({ error: 'Invalid gift' });
    }
    if (toUserId === authUser.id) {
      return reply.status(400).send({ error: 'Cannot gift yourself' });
    }
    if (await isBlocked(authUser.id, toUserId)) {
      return reply.status(403).send({ error: 'Cannot send a gift to this user' });
    }

    const balance = await spendCoins(authUser.id, gift.cost, 'GIFT', toUserId);

    const sender = await prisma.user.findUnique({ where: { id: authUser.id }, select: { displayName: true } });
    await NotificationService.create(
      toUserId,
      'GIFT_RECEIVED',
      'You received a gift!',
      `${sender?.displayName || 'Someone'} sent you a ${gift.name}.`,
      { giftId, fromUserId: authUser.id },
    );

    const io = (req as any).server.io;
    if (io) io.to(`user_${toUserId}`).emit('gift_received', { giftId, fromUserId: authUser.id });

    return { balance, gift: gift.name };
  });

  // POST /api/v1/coins/boost - Boost the user's profile for 1 hour.
  app.post('/boost', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const balance = await spendCoins(authUser.id, BOOST_COST, 'BOOST');

    const boostedUntil = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.user.update({ where: { id: authUser.id }, data: { boostedUntil } });

    return { balance, boostedUntil };
  });

  // POST /api/v1/coins/super-like - Send a super-like to another user.
  app.post('/super-like', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const { userId } = req.body as { userId: string };

    if (userId === authUser.id) {
      return reply.status(400).send({ error: 'Cannot super-like yourself' });
    }
    if (await isBlocked(authUser.id, userId)) {
      return reply.status(403).send({ error: 'Cannot super-like this user' });
    }

    const balance = await spendCoins(authUser.id, SUPER_LIKE_COST, 'SUPER_LIKE', userId);

    const sender = await prisma.user.findUnique({ where: { id: authUser.id }, select: { displayName: true } });
    await NotificationService.create(
      userId,
      'SUPER_LIKE',
      'You got a super like!',
      `${sender?.displayName || 'Someone'} super-liked you.`,
      { fromUserId: authUser.id },
    );

    const io = (req as any).server.io;
    if (io) io.to(`user_${userId}`).emit('super_like_received', { fromUserId: authUser.id });

    return { balance };
  });

  // POST /api/v1/coins/re-match - Reconnect with a previous match partner.
  app.post('/re-match', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const { matchId } = req.body as { matchId: string };

    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ user1Id: authUser.id }, { user2Id: authUser.id }],
      },
    });
    if (!match) {
      return reply.status(404).send({ error: 'Match not found' });
    }

    const balance = await spendCoins(authUser.id, RE_MATCH_COST, 'RE_MATCH', matchId);

    const peerId = match.user1Id === authUser.id ? match.user2Id : match.user1Id;
    const io = (req as any).server.io;
    if (io) io.to(`user_${peerId}`).emit('re_match_request', { matchId, fromUserId: authUser.id });

    return { balance, peerId };
  });
}
