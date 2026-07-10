import { describe, it, expect } from 'vitest';
import { resolvePlan } from '../routes/premium';
import { getPeerId } from '../lib/relations';
import { RegisterSchema, LoginSchema } from '../lib/validators';

describe('premium resolvePlan', () => {
  it('returns the plan for a valid id', () => {
    expect(resolvePlan('gold')?.name).toBe('Gold');
  });
  it('returns null for an invalid id', () => {
    expect(resolvePlan('diamond')).toBeNull();
    expect(resolvePlan(undefined)).toBeNull();
  });
});

describe('relations getPeerId', () => {
  it('returns the other user id (Prisma shape)', () => {
    expect(getPeerId({ user1Id: 'a', user2Id: 'b' }, 'a')).toBe('b');
    expect(getPeerId({ user1Id: 'a', user2Id: 'b' }, 'b')).toBe('a');
  });
  it('returns the other user id (socket shape)', () => {
    expect(getPeerId({ user1: 'a', user2: 'b' } as any, 'a')).toBe('b');
  });
});

describe('validation => ZodError (drives 400 in error handler)', () => {
  it('RegisterSchema rejects a short password', () => {
    const result = RegisterSchema.safeParse({ email: 'a@b.com', username: 'abc', password: '123' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.name).toBe('ZodError');
  });
  it('LoginSchema accepts valid input', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.com', password: 'password1' }).success).toBe(true);
  });
  it('RegisterSchema accepts phone now', () => {
    expect(RegisterSchema.safeParse({ email: 'a@b.com', username: 'abc', password: 'password1', phone: '+1234' }).success).toBe(true);
  });
});
