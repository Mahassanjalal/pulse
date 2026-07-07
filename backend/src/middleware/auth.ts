import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  isPremium: boolean;
  isVerified: boolean;
  role: 'USER' | 'ADMIN' | 'MODERATOR';
}

export function getAuthUser(req: FastifyRequest): AuthUser | undefined {
  return (req as any).authUser;
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