import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { FormsModule } from '@angular/forms';
import { NotificationService, NotificationItem } from '../../core/services/notification.service';

interface DisplayNotification {
  id: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  message: string;
  time: string;
  unread: boolean;
}

@Component({
  selector: 'pulse-notifications',
  template: `
    <div class="p-lg md:p-xl max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-xl">
        <div>
          <h1 class="font-headline-lg text-headline-lg text-on-surface mb-xs">Notifications</h1>
          <p class="font-body-md text-body-md text-on-surface-variant">Stay updated with your global activity.</p>
        </div>
        <button class="font-label-md text-label-md text-primary hover:underline" (click)="markAllRead()">Mark all read</button>
      </div>

      <div class="space-y-md">
        <div *ngFor="let notif of notifications" class="glass-panel rounded-2xl p-lg border border-white/10 flex items-start gap-md cursor-pointer hover:bg-white/5 transition-all" [class.border-l-4]="notif.unread" [style.border-left-color]="notif.unread ? 'var(--color-primary)' : 'transparent'" (click)="markRead(notif)">
          <div class="w-12 h-12 rounded-full flex items-center justify-center shrink-0" [class]="notif.iconBg">
            <span class="material-symbols-outlined" [class]="notif.iconColor">{{ notif.icon }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-sm">
              <h4 class="font-label-md text-label-md text-on-surface truncate">{{ notif.title }}</h4>
              <span class="text-[10px] text-on-surface-variant whitespace-nowrap">{{ notif.time }}</span>
            </div>
            <p class="text-sm text-on-surface-variant mt-1">{{ notif.message }}</p>
          </div>
          <div *ngIf="notif.unread" class="w-2 h-2 rounded-full bg-primary shrink-0 mt-1"></div>
        </div>
      </div>

      <div *ngIf="notifications.length === 0" class="text-center py-xl">
        <span class="material-symbols-outlined text-6xl text-on-surface-variant/30 mb-md">notifications_off</span>
        <p class="text-on-surface-variant">No notifications yet</p>
      </div>
    </div>
  `,
  styles: []
})
export class NotificationsPageComponent implements OnInit {
  notifications: DisplayNotification[] = [];

  private iconMap: Record<string, { icon: string; iconBg: string; iconColor: string }> = {
    FRIEND_REQUEST: { icon: 'person_add', iconBg: 'bg-primary/20', iconColor: 'text-primary' },
    FRIEND_ACCEPTED: { icon: 'group', iconBg: 'bg-primary/20', iconColor: 'text-primary' },
    NEW_MESSAGE: { icon: 'chat', iconBg: 'bg-secondary-fixed/20', iconColor: 'text-secondary-fixed' },
    MATCH_ENDED: { icon: 'videocam', iconBg: 'bg-tertiary/20', iconColor: 'text-tertiary' },
    PROFILE_VIEW: { icon: 'visibility', iconBg: 'bg-tertiary/20', iconColor: 'text-tertiary' },
    DAILY_REWARD: { icon: 'stars', iconBg: 'bg-tertiary/20', iconColor: 'text-tertiary' },
    PREMIUM_OFFER: { icon: 'workspace_premium', iconBg: 'bg-yellow-400/20', iconColor: 'text-yellow-400' },
    WARNING: { icon: 'warning', iconBg: 'bg-error/20', iconColor: 'text-error' },
  };

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    this.notificationService.loadNotifications();
    this.notificationService.notifications$.subscribe(items => {
      this.notifications = items.map(n => ({
        id: n.id,
        icon: this.iconMap[n.type]?.icon || 'notifications',
        iconBg: this.iconMap[n.type]?.iconBg || 'bg-primary/20',
        iconColor: this.iconMap[n.type]?.iconColor || 'text-primary',
        title: n.title,
        message: n.message,
        time: this.formatTime(n.timestamp),
        unread: n.unread,
      }));
    });
  }

  markAllRead(): void {
    this.notificationService.markAllAsRead();
  }

  markRead(notif: DisplayNotification): void {
    if (notif.unread) {
      this.notificationService.markAsRead(notif.id);
    }
  }

  private formatTime(date: Date): string {
    const now = new Date();
    const d = new Date(date);
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
