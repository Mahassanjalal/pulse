import { prisma } from './prisma';
import type { Server as SocketIOServer } from 'socket.io';

// Socket.IO server reference, set once at boot (server.ts). Used to push
// real-time `notification` events to connected clients. Null in contexts
// where the socket server isn't available.
let io: SocketIOServer | null = null;

export function setNotificationIO(server: SocketIOServer | null) {
  io = server;
}

export async function isBlocked(userId: string, targetId: string): Promise<boolean> {
  const blocked = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { userId, blockedUserId: targetId },
        { userId: targetId, blockedUserId: userId },
      ],
    },
  });
  return !!blocked;
}

export class NotificationService {
  static async create(userId: string, type: string, title: string, message: string, data?: any) {
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        data: data ? JSON.stringify(data) : null,
      },
    });

    // Real-time push: the frontend NotificationService subscribes to the
    // `notification` event to update its store without polling.
    if (io) {
      io.to(`user_${userId}`).emit('notification', notification);
    }

    return notification;
  }

  static async friendRequest(toUserId: string, fromUserName: string) {
    return this.create(
      toUserId,
      'FRIEND_REQUEST',
      'New Friend Request',
      `${fromUserName} wants to connect with you.`
    );
  }

  static async friendAccepted(toUserId: string, fromUserName: string) {
    return this.create(
      toUserId,
      'FRIEND_ACCEPTED',
      'Friend Request Accepted',
      `${fromUserName} accepted your friend request.`
    );
  }

  static async newMessage(toUserId: string, fromUserName: string) {
    return this.create(
      toUserId,
      'NEW_MESSAGE',
      'New Message',
      `${fromUserName} sent you a message.`
    );
  }

  static async matchEnded(toUserId: string, peerName: string) {
    return this.create(
      toUserId,
      'MATCH_ENDED',
      'Match Ended',
      `Your conversation with ${peerName} has ended.`
    );
  }
}
