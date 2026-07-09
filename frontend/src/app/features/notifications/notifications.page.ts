import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../core/services/notification.service';
import { NotificationItem } from '@models/user.model';

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
        <button class="font-label-md text-label-md text-primary hover:underline" (click)="markAllRead()" type="button" aria-label="Mark all notifications as read">Mark all read</button>
      </div>

      <!-- Loading Skeleton -->
      <div *ngIf="isLoading" class="space-y-md" aria-label="Loading notifications">
        <div *ngFor="let i of [1,2,3,4,5]" class="glass-panel rounded-2xl p-lg border border-white/10 flex items-start gap-md animate-pulse">
          <div class="w-12 h-12 rounded-full bg-surface-container shrink-0"></div>
          <div class="flex-1 min-w-0 space-y-2">
            <div class="flex items-center justify-between">
              <div class="h-4 w-32 bg-surface-container rounded"></div>
              <div class="h-3 w-12 bg-surface-container rounded"></div>
            </div>
            <div class="h-3 w-full bg-surface-container rounded"></div>
          </div>
        </div>
      </div>

      <!-- Error State -->
      <div *ngIf="hasError && !isLoading" class="text-center py-xl" role="alert">
        <span class="material-symbols-outlined text-6xl text-on-surface-variant/30 mb-md" aria-hidden="true">error_outline</span>
        <p class="text-on-surface-variant mb-md">Failed to load notifications</p>
        <button (click)="retry()" type="button" class="text-primary hover:underline font-label text-label-md">Try Again</button>
      </div>

      <!-- Notifications List -->
      <div *ngIf="!isLoading && !hasError" class="space-y-md">
        <div *ngFor="let notif of notifications" class="glass-panel rounded-2xl p-lg border border-white/10 flex items-start gap-md cursor-pointer hover:bg-white/5 transition-all group" [class.border-l-4]="notif.unread" [style.border-left-color]="notif.unread ? 'var(--color-primary)' : 'transparent'" (click)="markRead(notif)" role="article" [attr.aria-label]="notif.title + ': ' + notif.message">
          <div class="w-12 h-12 rounded-full flex items-center justify-center shrink-0" [class]="notif.iconBg" aria-hidden="true">
            <span class="material-symbols-outlined" [class]="notif.iconColor">{{ notif.icon }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-sm">
              <h4 class="font-label-md text-label-md text-on-surface truncate">{{ notif.title }}</h4>
              <span class="text-[10px] text-on-surface-variant whitespace-nowrap">{{ notif.time }}</span>
            </div>
            <p class="text-sm text-on-surface-variant mt-1">{{ notif.message }}</p>
          </div>
          <div class="flex items-center gap-xs">
            <div *ngIf="notif.unread" class="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Unread"></div>
            <button (click)="$event.stopPropagation(); deleteNotif(notif.id)" type="button" class="material-symbols-outlined text-body-md text-on-surface-variant opacity-0 group-hover:opacity-100 hover:text-error transition-all" [attr.aria-label]="'Delete notification: ' + notif.title">close</button>
          </div>
        </div>
      </div>

      <div *ngIf="!isLoading && !hasError && hasMore" class="text-center mt-lg">
        <button (click)="loadMore()" type="button" class="text-primary font-label-md hover:underline" aria-label="Load more notifications">Load More</button>
      </div>

      <div *ngIf="!isLoading && !hasError && notifications.length === 0" class="text-center py-xl">
        <span class="material-symbols-outlined text-6xl text-on-surface-variant/30 mb-md" aria-hidden="true">notifications_off</span>
        <p class="text-on-surface-variant">No notifications yet</p>
      </div>
    </div>
  `,
  styles: []
})
export class NotificationsPageComponent implements OnInit {
  notifications: DisplayNotification[] = [];
  hasMore = false;
  isLoading = true;
  hasError = false;

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
    this.loadNotifications();
  }

  loadNotifications(): void {
    this.isLoading = true;
    this.hasError = false;
    this.notificationService.loadNotifications();
    this.notificationService.notifications$.subscribe({
      next: (items) => {
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
        this.hasMore = this.notificationService.hasMore;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.hasError = true;
      }
    });
  }

  retry(): void {
    this.loadNotifications();
  }

  loadMore(): void {
    this.notificationService.loadMore();
  }

  deleteNotif(id: string): void {
    this.notificationService.deleteNotification(id);
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
