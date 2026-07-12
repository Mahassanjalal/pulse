import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  // 'query', 'info', 'warn'
  log: process.env.NODE_ENV === 'development' ? [] : ['error'],
});