import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, getAuthUser } from '../middleware/auth';

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
    const planType = plan.name.toUpperCase() as 'SILVER' | 'GOLD' | 'PLATINUM';
    
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