import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser } from '../middleware/auth';
import { stripe, isStripeConfigured } from '../lib/stripe';
import { unlockAccount } from '../lib/moderation';
import { adjustCoins } from '../lib/coins';
import { claimPaymentEvent } from '../lib/payments';
import { resolveCoinPackage } from './coins';

const PLANS = [
  {
    id: 'silver',
    name: 'Silver',
    price: 9.99,
    period: 'monthly',
    features: ['Ad-Free Experience', 'HD Video (720p)', 'Send & Accept Friend Requests', 'Advanced Filters (Gender & Location)', 'Basic Support', 'Silver Premium Badge'],
    popular: false,
  },
  {
    id: 'gold',
    name: 'Gold',
    price: 19.99,
    period: 'monthly',
    features: ['Everything in Silver', 'Full HD Video (1080p)', 'Global Travel Mode', 'Incognito Mode', 'Priority Support', 'Gold Premium Badge', 'Custom Themes'],
    popular: true,
  },
  {
    id: 'platinum',
    name: 'Platinum',
    price: 29.99,
    period: 'monthly',
    features: ['Everything in Gold', 'AI-Enhanced Matchmaking', 'Animated Premium Badge', '24/7 VIP Dedicated Support', 'Unlimited Global Travel', 'Exclusive Custom Themes', 'Priority in Matching Queue'],
    popular: false,
  },
];

function computeEndDate(period: string): Date {
  const endDate = new Date();
  if (period === 'yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }
  return endDate;
}

function planPrice(plan: typeof PLANS[number], period: string): number {
  return period === 'yearly' ? plan.price * 12 * 0.8 : plan.price;
}

type Plan = typeof PLANS[number];

// Single source of truth for "find a plan by id", shared by create-checkout,
// subscribe, and the Stripe webhook (previously copy-pasted everywhere).
export function resolvePlan(planId: string | undefined): Plan | null {
  if (!planId) return null;
  return PLANS.find((p) => p.id === planId) ?? null;
}

export async function grantPremium(userId: string, plan: typeof PLANS[number], period: string): Promise<any> {
  const endDate = computeEndDate(period);
  const price = planPrice(plan, period);
  const planType = plan.name.toUpperCase() as 'SILVER' | 'GOLD' | 'PLATINUM';

  const subscription = await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      planType,
      price,
      period,
      features: JSON.stringify(plan.features),
      endDate,
    },
    update: {
      planType,
      price,
      period,
      features: JSON.stringify(plan.features),
      endDate,
      isActive: true,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { isPremium: true, premiumUntil: endDate },
  });

  return subscription;
}

export async function revokePremium(userId: string): Promise<void> {
  await prisma.subscription.updateMany({
    where: { userId },
    data: { isActive: false },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { isPremium: false },
  });
}

/**
 * H8: premium expiry enforcement. Nothing previously flipped isPremium when
 * premiumUntil passed, so lapsed subscribers kept perks forever. Called from a
 * daily sweep in server.ts (and cheap enough to also check on auth).
 * Returns the number of accounts revoked.
 */
export async function revokeExpiredPremium(): Promise<number> {
  const now = new Date();
  const result = await prisma.user.updateMany({
    where: { isPremium: true, premiumUntil: { lt: now } },
    data: { isPremium: false },
  });
  if (result.count > 0) {
    await prisma.subscription.updateMany({
      where: { isActive: true, endDate: { lt: now } },
      data: { isActive: false },
    });
  }
  return result.count;
}

export default async function premiumRoutes(app: FastifyInstance) {
  // GET /api/v1/premium/plans - Get available subscription plans
  app.get('/plans', async () => {
    return { plans: PLANS };
  });

  // GET /api/v1/premium/subscription - Get current user subscription
  app.get('/subscription', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;

    const subscription = await prisma.subscription.findUnique({
      where: { userId: authUser.id },
    });

    return { subscription };
  });

  // POST /api/v1/premium/create-checkout - Create a Stripe Checkout Session.
  // Falls back to a direct grant (dev mode) when Stripe is not configured.
  app.post('/create-checkout', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const { planId, period = 'monthly' } = req.body as { planId: string; period?: string };

    const plan = resolvePlan(planId);
    if (!plan) {
      return reply.status(400).send({ error: 'Invalid plan' });
    }

    // Dev mode: no Stripe keys -> grant directly so the flow is testable.
    if (!isStripeConfigured || !stripe) {
      const subscription = await grantPremium(authUser.id, plan, period);
      return { devMode: true, subscription };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: authUser.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(planPrice(plan, period) * 100),
            recurring: { interval: period === 'yearly' ? 'year' : 'month' },
            product_data: {
              name: `Pulse ${plan.name} (${period})`,
              description: plan.features.join(', '),
            },
          },
        },
      ],
      metadata: { userId: authUser.id, planId: plan.id, period },
      success_url: `${process.env.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.STRIPE_CANCEL_URL}`,
    });

    return { sessionId: session.id, url: session.url };
  });

  // GET /api/v1/premium/checkout-status - Verify a completed Checkout Session
  // and grant premium if the payment succeeded (used when the webhook is delayed).
  app.get('/checkout-status', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const { session_id } = req.query as { session_id?: string };

    if (!session_id) {
      return reply.status(400).send({ error: 'session_id required' });
    }
    if (!isStripeConfigured || !stripe) {
      return { devMode: true, isPremium: authUser.isPremium };
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    // Ownership check: only the user who created the session may claim it
    // (audit C4 — previously any authenticated user could pass any session_id).
    if (session.metadata?.userId !== authUser.id) {
      return reply.status(403).send({ error: 'This checkout session belongs to another account' });
    }
    
    if (session.payment_status === 'paid' || session.status === 'complete') {
      const meta = session.metadata as { planId?: string; period?: string } | null;
      const plan = PLANS.find(p => p.id === meta?.planId);
      if (plan && meta?.period) {
        // Idempotent: the session id can only ever grant once, so repeatedly
        // polling this endpoint (or racing the webhook) can't re-extend
        // premium. The webhook uses the event id as its own separate claim.
        const claimed = await claimPaymentEvent(session_id, authUser.id, 'PREMIUM', plan.id);
        if (claimed) {
          await grantPremium(authUser.id, plan, meta.period);
        }
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { isPremium: true, premiumUntil: true },
    });
    return { isPremium: user?.isPremium || false, premiumUntil: user?.premiumUntil };
  });

  // POST /api/v1/premium/subscribe - Direct subscribe. DEVELOPMENT ONLY:
  // previously this granted premium with no payment in every environment
  // (audit C3) — anyone with a token could give themselves premium for free.
  // Production must use /create-checkout.
  app.post('/subscribe', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    
    if (isStripeConfigured) {
      return reply.status(403).send({ error: 'Use /premium/create-checkout to subscribe', code: 'PAYMENT_REQUIRED' });
    }
    
    const { planId, period = 'monthly' } = req.body as { planId: string; period?: string };

    const plan = resolvePlan(planId);
    if (!plan) {
      return reply.status(400).send({ error: 'Invalid plan' });
    }

    const subscription = await grantPremium(authUser.id, plan, period);
    return { devMode: true, subscription };
  });

  // POST /api/v1/premium/cancel - Cancel subscription
  app.post('/cancel', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;

    await prisma.subscription.updateMany({
      where: { userId: authUser.id },
      data: { isActive: false },
    });

    await prisma.user.update({
      where: { id: authUser.id },
      data: { isPremium: false },
    });

    return { success: true };
  });
}

// Stripe webhook handler (registered separately with raw body capture in server.ts)
export async function handleStripeWebhook(req: any, reply: any): Promise<void> {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return reply.status(400).send({ error: 'Stripe webhook not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err: any) {
    return reply.status(400).send({ error: `Webhook signature verification failed: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const userId = session.metadata?.userId;
    const purpose: 'PREMIUM' | 'UNLOCK' | 'COINS' =
      session.metadata?.purpose === 'UNLOCK' ? 'UNLOCK'
      : session.metadata?.purpose === 'COINS' ? 'COINS'
      : 'PREMIUM';
    
    // Stripe retries deliveries: claim the EVENT id first so a retry can never
    // double-grant coins/premium (audit C4). This is a separate claim key from
    // the session-id claim used by the status-poll path, so both paths
    // together still grant exactly once.
    if (userId) {
      const claimed = await claimPaymentEvent(event.id, userId, purpose, session.metadata?.packageId || session.metadata?.planId);
      if (!claimed) {
        req.log?.info?.({ eventId: event.id }, 'Stripe webhook event already processed — skipping');
        return reply.send({ received: true, duplicate: true });
      }
    }
    
    const planId = session.metadata?.planId;
    const period = session.metadata?.period || 'monthly';
    const plan = resolvePlan(planId);
    if (userId && plan) {
      await grantPremium(userId, plan, period);
    }
    // Account-unlock payment ($10) also lands here with purpose: UNLOCK.
    if (userId && session.metadata?.purpose === 'UNLOCK') {
      await unlockAccount(userId);
    }
    // Coin purchases land here with purpose: COINS.
    if (userId && session.metadata?.purpose === 'COINS') {
      const pkg = resolveCoinPackage(session.metadata?.packageId);
      if (pkg) await adjustCoins(userId, pkg.coins + pkg.bonus, 'PURCHASE', pkg.id);
    }
  }

  return reply.send({ received: true });
}
