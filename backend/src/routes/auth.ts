import { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { RegisterSchema, LoginSchema } from '../lib/validators';
import { authenticate, getAuthUser } from '../middleware/auth';

export default async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/register
  app.post('/register', async (req, reply) => {
    const data = RegisterSchema.parse(req.body);
    
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: data.email }, { username: data.username }] },
    });
    
    if (existing) {
      reply.status(409);
      return { error: 'Email or username already exists' };
    }
    
    const hashedPassword = await argon2.hash(data.password);
    
    const user = await prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        displayName: data.displayName || data.username,
        password: hashedPassword,
        age: data.age,
        gender: data.gender,
        country: data.country,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        isPremium: true,
        isVerified: true,
      },
    });
    
    const token = app.jwt.sign({ userId: user.id }, { expiresIn: '15m' });
    const refreshToken = uuidv4();
    
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    
    return { user, token, refreshToken };
  });

  // POST /api/v1/auth/login
  app.post('/login', async (req, reply) => {
    const data = LoginSchema.parse(req.body);
    
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });
    
    if (!user) {
      reply.status(401);
      return { error: 'Invalid email or password' };
    }
    
    const valid = await argon2.verify(user.password, data.password);
    if (!valid) {
      reply.status(401);
      return { error: 'Invalid email or password' };
    }
    
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'ONLINE', lastSeen: new Date() },
    });

    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        ipAddress: req.ip || req.headers['x-forwarded-for'] as string || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        device: req.headers['sec-ch-ua-platform'] as string || 'unknown',
      },
    });
    
    const token = app.jwt.sign({ userId: user.id }, { expiresIn: '15m' });
    const refreshToken = uuidv4();
    
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    
    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        isPremium: user.isPremium,
        isVerified: user.isVerified,
      },
      token,
      refreshToken,
    };
  });

  // POST /api/v1/auth/refresh
  app.post('/refresh', async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken: string };
    
    if (!refreshToken) {
      reply.status(400);
      return { error: 'Refresh token required' };
    }
    
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });
    
    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      reply.status(401);
      return { error: 'Invalid or expired refresh token' };
    }
    
    const newToken = app.jwt.sign({ userId: tokenRecord.userId }, { expiresIn: '15m' });
    
    return { token: newToken };
  });

  // POST /api/v1/auth/logout
  app.post('/logout', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    const { refreshToken } = req.body as { refreshToken: string };
    
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }
    
    await prisma.user.update({
      where: { id: authUser.id },
      data: { status: 'OFFLINE', lastSeen: new Date() },
    });
    
    return { success: true };
  });

  // GET /api/v1/auth/me
  app.get('/me', { preHandler: authenticate }, async (req) => {
    const authUser = getAuthUser(req)!;
    
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        age: true,
        gender: true,
        bio: true,
        country: true,
        languages: true,
        interests: true,
        profilePicture: true,
        coverImage: true,
        isVerified: true,
        isPremium: true,
        status: true,
        trustScore: true,
        verificationLevel: true,
        communityRating: true,
        coins: true,
        dailyStreak: true,
        friendsCount: true,
        totalConversations: true,
        createdAt: true,
        privacySettings: true,
        preferences: true,
        achievements: true,
      },
    });
    
    return { user };
  });

  // POST /api/v1/auth/guest - Continue as guest
  app.post('/guest', async (req) => {
    const guestId = 'guest_' + uuidv4().slice(0, 8);
    
    const user = await prisma.user.create({
      data: {
        email: `${guestId}@guest.pulse`,
        username: guestId,
        password: '',
        isGuest: true,
      },
      select: {
        id: true,
        email: true,
        username: true,
        isGuest: true,
      },
    });
    
    const token = app.jwt.sign({ userId: user.id }, { expiresIn: '1h' });
    
    return { user, token };
  });

  // POST /api/v1/auth/change-password
  app.post('/change-password', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

    if (!currentPassword || !newPassword) {
      reply.status(400);
      return { error: 'Current password and new password are required' };
    }

    if (newPassword.length < 8) {
      reply.status(400);
      return { error: 'New password must be at least 8 characters' };
    }

    const user = await prisma.user.findUnique({ where: { id: authUser.id } });
    if (!user) {
      reply.status(404);
      return { error: 'User not found' };
    }

    if (user.isGuest) {
      reply.status(400);
      return { error: 'Guest users cannot change password' };
    }

    const valid = await argon2.verify(user.password, currentPassword);
    if (!valid) {
      reply.status(401);
      return { error: 'Current password is incorrect' };
    }

    const hashedPassword = await argon2.hash(newPassword);
    await prisma.user.update({
      where: { id: authUser.id },
      data: { password: hashedPassword },
    });

    return { success: true };
  });

  // DELETE /api/v1/auth/account
  app.delete('/account', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;

    await prisma.refreshToken.deleteMany({ where: { userId: authUser.id } });
    await prisma.user.update({
      where: { id: authUser.id },
      data: { status: 'OFFLINE' },
    });

    await prisma.user.delete({ where: { id: authUser.id } });

    return { success: true };
  });
}