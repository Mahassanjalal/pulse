import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma so notification tests don't touch the real DB (FK violations).
vi.mock('../lib/prisma', () => ({
  prisma: {
    notification: { create: vi.fn().mockResolvedValue({ id: 'n1', type: 'FRIEND_REQUEST' }) },
  },
}));

import { requireUnlocked } from '../middleware/auth';
import { NotificationService, setNotificationIO } from '../lib/notifications';
import type { Server } from 'socket.io';

function mockReply() {
  return { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as any;
}

describe('requireUnlocked guard', () => {
  it('rejects a locked USER with 403', async () => {
    const req = { authUser: { id: '1', role: 'USER', isLocked: true } } as any;
    const reply = mockReply();
    await requireUnlocked(req, reply);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ACCOUNT_LOCKED' })
    );
  });

  it('allows a non-locked USER through', async () => {
    const req = { authUser: { id: '1', role: 'USER', isLocked: false } } as any;
    const reply = mockReply();
    await requireUnlocked(req, reply);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('exempts admins/moderators even when flagged locked', async () => {
    const req = { authUser: { id: '1', role: 'ADMIN', isLocked: true } } as any;
    const reply = mockReply();
    await requireUnlocked(req, reply);
    expect(reply.status).not.toHaveBeenCalled();
  });
});

describe('NotificationService real-time push', () => {
  it('emits a socket `notification` event to the user room when io is set', async () => {
    const emit = vi.fn();
    const io = { to: vi.fn().mockReturnValue({ emit }) } as unknown as Server;
    setNotificationIO(io);

    await NotificationService.friendRequest('user_42', 'Alice');

    expect((io as any).to).toHaveBeenCalledWith('user_user_42');
    expect(emit).toHaveBeenCalledWith('notification', expect.objectContaining({ type: 'FRIEND_REQUEST' }));
  });

  it('does not throw when io is null (persists via mocked prisma)', async () => {
    setNotificationIO(null);
    await expect(NotificationService.newMessage('user_7', 'Bob')).resolves.toBeDefined();
  });
});
