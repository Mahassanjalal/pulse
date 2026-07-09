import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '@env/environment';
import { SocketService } from './socket.service';
import { NotificationItem } from '@models/user.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notifications = new BehaviorSubject<NotificationItem[]>([]);
  private unreadCount = new BehaviorSubject<number>(0);

  constructor(private http: HttpClient, private socketService: SocketService) {
    this.socketService.on('notification').subscribe((data: any) => {
      this.addNotification({
        id: data.id || Date.now().toString(),
        type: data.type || 'GENERAL',
        title: data.title || 'Notification',
        message: data.message || '',
        unread: true,
        timestamp: data.createdAt ? new Date(data.createdAt) : new Date(),
        data: data.data ? JSON.parse(data.data) : undefined,
      });
    });
  }

  get notifications$(): Observable<NotificationItem[]> {
    return this.notifications.asObservable();
  }

  get unreadCount$(): Observable<number> {
    return this.unreadCount.asObservable();
  }

  private _hasMore = false;
  private _currentPage = 0;
  private _allNotifications: NotificationItem[] = [];

  get hasMore(): boolean { return this._hasMore; }

  loadNotifications(page = 1, limit = 20): void {
    this.http.get<{ notifications: NotificationItem[]; unreadCount: number; hasMore: boolean }>(`${environment.apiUrl}/notifications?page=${page}&limit=${limit}`).subscribe({
      next: (res) => {
        this._currentPage = page;
        this._hasMore = res.hasMore;
        const mapped = res.notifications.map(n => ({ ...n, timestamp: new Date(n.timestamp) }));
        if (page === 1) {
          this._allNotifications = mapped;
        } else {
          this._allNotifications = [...this._allNotifications, ...mapped];
        }
        this.notifications.next(this._allNotifications);
        this.unreadCount.next(res.unreadCount);
      },
      error: () => {
        if (page === 1) {
          this._allNotifications = [];
          this.notifications.next([]);
        }
        this.unreadCount.next(0);
      }
    });
  }

  loadMore(): void {
    if (!this._hasMore) return;
    this.loadNotifications(this._currentPage + 1);
  }

  addNotification(notification: NotificationItem): void {
    const current = this.notifications.value;
    this.notifications.next([notification, ...current]);
    if (notification.unread) {
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

  deleteNotification(id: string): void {
    this.http.delete(`${environment.apiUrl}/notifications/${id}`).subscribe({
      next: () => {
        this._allNotifications = this._allNotifications.filter(n => n.id !== id);
        this.notifications.next(this._allNotifications);
        this.unreadCount.next(this._allNotifications.filter(n => n.unread).length);
      }
    });
  }

  clearAll(): void {
    this.notifications.next([]);
    this.unreadCount.next(0);
  }

  getUnreadCount(): number {
    return this.unreadCount.value;
  }
}
