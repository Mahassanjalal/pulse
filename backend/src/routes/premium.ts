import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser } from '../middleware/auth';

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 4.99,
    period: 'monthly',
    features: ['Gender Filter', 'HD Video', 'Ad-Free', 'Basic Support'],
    popular: false,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 9.99,
    period: 'monthly',
    features: ['Everything in Basic', 'Global Travel Mode', 'Premium Badge', 'Priority Support', 'Advanced Filters'],
    popular: true,
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    price: 19.99,
    period: 'monthly',
    features: ['Everything in Premium', 'Incognito Mode', 'AI Matchmaking', '24/7 VIP Support', 'Custom Themes'],
    popular: false,
  },
];

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

  // POST /api/v1/premium/subscribe - Subscribe to a plan
  app.post('/subscribe', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const { planId, period = 'monthly' } = req.body as { planId: string; period?: string };
    
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) {
      return { error: 'Invalid plan' };
    }
    
    const endDate = new Date();
    if (period === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }
    
    const price = period === 'yearly' ? plan.price * 12 * 0.8 : plan.price;
    const planType = plan.name.toUpperCase() as 'BASIC' | 'PREMIUM' | 'ULTIMATE';
    
    const subscription = await prisma.subscription.upsert({
      where: { userId: authUser.id },
      create: {
        userId: authUser.id,
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
      where: { id: authUser.id },
      data: { isPremium: true, premiumUntil: endDate },
    });
    
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