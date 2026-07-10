import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser } from '../middleware/auth';
import { stripe, isStripeConfigured } from '../lib/stripe';
import { unlockAccount } from '../lib/moderation';

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

async function grantPremium(userId: string, plan: typeof PLANS[number], period: string): Promise<any> {
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
    if (session.payment_status === 'paid' || session.status === 'complete') {
      const meta = session.metadata as { planId?: string; period?: string } | null;
      const plan = PLANS.find(p => p.id === meta?.planId);
      if (plan && meta?.period) {
        await grantPremium(authUser.id, plan, meta.period);
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { isPremium: true, premiumUntil: true },
    });
    return { isPremium: user?.isPremium || false, premiumUntil: user?.premiumUntil };
  });

  // POST /api/v1/premium/subscribe - Direct subscribe (dev/testing fallback).
  app.post('/subscribe', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const { planId, period = 'monthly' } = req.body as { planId: string; period?: string };

    const plan = resolvePlan(planId);
    if (!plan) {
      return reply.status(400).send({ error: 'Invalid plan' });
    }

    const subscription = await grantPremium(authUser.id, plan, period);
    return { subscription };
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
  }

  return reply.send({ received: true });
}
