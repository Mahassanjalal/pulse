import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  isPremium: boolean;
  isVerified: boolean;
  isLocked: boolean;
  role: 'USER' | 'ADMIN' | 'MODERATOR';
  coins: number;
}

export function getAuthUser(req: FastifyRequest): AuthUser | undefined {
  return (req as any).authUser;
}

/**
 * PreHandler that rejects locked accounts with 403. Admins/moderators are
 * exempt so they can still operate. Use on any route that lets a user connect
 * with others (matching, chat, friends, video/WebRTC signaling).
 */
export async function requireUnlocked(req: FastifyRequest, reply: FastifyReply) {
  const user = getAuthUser(req);
  if (user && user.isLocked && user.role === 'USER') {
    reply.status(403).send({ error: 'Account locked', code: 'ACCOUNT_LOCKED', lockReason: user.isLocked ? 'Account locked due to a violation. Pay $10 to unlock.' : undefined });
    return;
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      reply.status(401).send({ error: 'No token provided' });
      return;
    }

    const decoded = await req.jwtVerify<{ userId: string }>();
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        isPremium: true,
        isVerified: true,
        isLocked: true,
        role: true,
      },
    });

    if (!user) {
      reply.status(401).send({ error: 'Invalid token' });
      return;
    }

    (req as any).authUser = user;
  } catch (err) {
    reply.status(401).send({ error: 'Invalid token' });
  }
}