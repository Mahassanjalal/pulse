import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface NotificationItem {
  id: string;
  type: 'friend_request' | 'friend_accepted' | 'message' | 'like' | 'profile_view' | 'premium_offer' | 'daily_reward' | 'warning' | 'report' | 'new_feature';
  title: string;
  message: string;
  unread: boolean;
  timestamp: Date;
  data?: any;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notifications = new BehaviorSubject<NotificationItem[]>([]);
  private unreadCount = new BehaviorSubject<number>(0);

  get notifications$(): Observable<NotificationItem[]> {
    return this.notifications.asObservable();
  }

  get unreadCount$(): Observable<number> {
    return this.unreadCount.asObservable();
  }

  addNotification(notification: NotificationItem): void {
    const current = this.notifications.value;
    this.notifications.next([notification, ...current]);
    if (!notification.unread) {
      this.unreadCount.next(current.filter(n => !n.unread).length + 1);
    }
  }

  markAsRead(id: string): void {
    const current = this.notifications.value;
    const updated = current.map(n => n.id === id ? { ...n, unread: false } : n);
    this.notifications.next(updated);
    this.unreadCount.next(updated.filter(n => !n.unread).length);
  }

  markAllAsRead(): void {
    const current = this.notifications.value;
    const updated = current.map(n => ({ ...n, unread: false }));
    this.notifications.next(updated);
    this.unreadCount.next(0);
  }

  clearAll(): void {
    this.notifications.next([]);
    this.unreadCount.next(0);
  }

  sendFriendRequestNotification(userId: string, userName: string): void {
    this.addNotification({
      id: Math.random().toString(),
      type: 'friend_request',
      title: 'New Friend Request',
      message: `${userName} sent you a friend request`,
      unread: true,
      timestamp: new Date(),
      data: { userId }
    });
  }

  sendMessageNotification(userId: string, userName: string, message: string): void {
    this.addNotification({
      id: Math.random().toString(),
      type: 'message',
      title: 'New Message',
      message,
      unread: true,
      timestamp: new Date(),
      data: { userId }
    });
  }
}
