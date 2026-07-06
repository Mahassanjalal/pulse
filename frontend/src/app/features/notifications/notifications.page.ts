import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { FormsModule } from '@angular/forms';

interface NotificationItem {
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
        <div *ngFor="let notif of notifications" class="glass-panel rounded-2xl p-lg border border-white/10 flex items-start gap-md cursor-pointer hover:bg-white/5 transition-all" [class.border-l-4]="notif.unread" [style.border-left-color]="notif.unread ? 'var(--color-primary)' : 'transparent'">
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
export class NotificationsPageComponent {
  notifications: NotificationItem[] = [
    {
      id: '1', icon: 'person_add', iconBg: 'bg-primary/20', iconColor: 'text-primary',
      title: 'New Friend Request', message: 'Alex Rivera wants to connect with you.',
      time: '2m ago', unread: true
    },
    {
      id: '2', icon: 'favorite', iconBg: 'bg-error/20', iconColor: 'text-error',
      title: 'Profile Like', message: 'Sarah M. liked your profile.',
      time: '15m ago', unread: true
    },
    {
      id: '3', icon: 'chat', iconBg: 'bg-secondary-fixed/20', iconColor: 'text-secondary-fixed',
      title: 'New Message', message: 'Kai Sterling sent you a message.',
      time: '1h ago', unread: true
    },
    {
      id: '4', icon: 'stars', iconBg: 'bg-tertiary/20', iconColor: 'text-tertiary',
      title: 'Daily Reward', message: 'Claim your daily gems streak reward!',
      time: '3h ago', unread: false
    },
    {
      id: '5', icon: 'group', iconBg: 'bg-primary/20', iconColor: 'text-primary',
      title: 'Friend Accepted', message: 'Mira Zhang accepted your friend request.',
      time: '5h ago', unread: false
    },
    {
      id: '6', icon: 'workspace_premium', iconBg: 'bg-yellow-400/20', iconColor: 'text-yellow-400',
      title: 'Premium Offer', message: 'Get 50% off your first month of Pulse Premium!',
      time: '1d ago', unread: false
    }
  ];

  markAllRead(): void {
    this.notifications.forEach(n => n.unread = false);
  }
}
