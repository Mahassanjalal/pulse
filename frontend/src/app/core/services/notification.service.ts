import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '@env/environment';

export interface NotificationItem {
  id: string;
  type: string;
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

  constructor(private http: HttpClient) {}

  get notifications$(): Observable<NotificationItem[]> {
    return this.notifications.asObservable();
  }

  get unreadCount$(): Observable<number> {
    return this.unreadCount.asObservable();
  }

  loadNotifications(page = 1, limit = 20): void {
    this.http.get<{ notifications: NotificationItem[]; unreadCount: number }>(`${environment.apiUrl}/notifications?page=${page}&limit=${limit}`).subscribe({
      next: (res) => {
        this.notifications.next(res.notifications);
        this.unreadCount.next(res.unreadCount);
      },
      error: () => {
        this.notifications.next([]);
        this.unreadCount.next(0);
      }
    });
  }

  addNotification(notification: NotificationItem): void {
    const current = this.notifications.value;
    this.notifications.next([notification, ...current]);
    if (!notification.unread) {
      this.unreadCount.next(this.unreadCount.value + 1);
    }
  }

  markAsRead(id: string): void {
    this.http.post(`${environment.apiUrl}/notifications/${id}/read`, {}).subscribe({
      next: () => {
        const current = this.notifications.value;
        const updated = current.map(n => n.id === id ? { ...n, unread: false } : n);
        this.notifications.next(updated);
        this.unreadCount.next(updated.filter(n => n.unread).length);
      }
    });
  }

  markAllAsRead(): void {
    this.http.post(`${environment.apiUrl}/notifications/read-all`, {}).subscribe({
      next: () => {
        const updated = this.notifications.value.map(n => ({ ...n, unread: false }));
        this.notifications.next(updated);
        this.unreadCount.next(0);
      }
    });
  }

  clearAll(): void {
    this.notifications.next([]);
    this.unreadCount.next(0);
  }
}
