import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminStats } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { AdminUsersComponent } from './admin-users.component';
import { AdminReportsComponent } from './admin-reports.component';
import { AdminContentComponent } from './admin-content.component';
import { AdminPremiumComponent } from './admin-premium.component';
import { AdminSocialComponent } from './admin-social.component';
import { AdminBroadcastComponent } from './admin-broadcast.component';
import { AdminSettingsComponent } from './admin-settings.component';
import { AdminAuditComponent } from './admin-audit.component';

interface TabDef { id: string; label: string; icon: string; adminOnly: boolean; }

@Component({
  selector: 'pulse-admin',
  template: `
    <div class="p-lg md:p-xl max-w-7xl mx-auto">
      <h1 class="font-display-lg text-display-lg text-white mb-md">Admin Panel</h1>
      <p class="font-body-md text-body-md text-on-surface-variant mb-xl">Control every part of the Pulse platform.</p>

      <div *ngIf="loading" class="flex justify-center py-xl">
        <span class="material-symbols-outlined text-3xl text-primary pulse-animation">sync</span>
      </div>
      <div *ngIf="error" class="text-center text-error py-xl">{{ error }}</div>

      <div *ngIf="!loading && !error">
        <!-- Stat strip -->
        <div class="grid grid-cols-2 md:grid-cols-6 gap-md mb-xl">
          <div class="glass-panel rounded-2xl p-md"><p class="text-on-surface-variant text-xs uppercase tracking-wide">Users</p><p class="font-display-md text-display-md text-white">{{ stats.totalUsers }}</p></div>
          <div class="glass-panel rounded-2xl p-md"><p class="text-on-surface-variant text-xs uppercase tracking-wide">Online</p><p class="font-display-md text-display-md text-tertiary">{{ stats.onlineUsers }}</p></div>
          <div class="glass-panel rounded-2xl p-md"><p class="text-on-surface-variant text-xs uppercase tracking-wide">Premium</p><p class="font-display-md text-display-md text-white">{{ stats.premiumUsers }}</p></div>
          <div class="glass-panel rounded-2xl p-md"><p class="text-on-surface-variant text-xs uppercase tracking-wide">Matches</p><p class="font-display-md text-display-md text-white">{{ stats.totalMatches }}</p></div>
          <div class="glass-panel rounded-2xl p-md"><p class="text-on-surface-variant text-xs uppercase tracking-wide">Friends</p><p class="font-display-md text-display-md text-white">{{ stats.totalFriends }}</p></div>
          <div class="glass-panel rounded-2xl p-md"><p class="text-on-surface-variant text-xs uppercase tracking-wide">Reports</p><p class="font-display-md text-display-md text-error">{{ stats.pendingReports }}</p></div>
        </div>

        <!-- Tabs -->
        <div class="flex flex-wrap gap-1 mb-lg border-b border-white/5">
          <button *ngFor="let t of tabs"
                  type="button"
                  [hidden]="t.adminOnly && !isAdmin"
                  class="sidebar-item"
                  [class.active]="active === t.id"
                  (click)="active = t.id">
            <span class="material-symbols-outlined text-xl" [class]="active === t.id ? 'text-primary' : ''">{{ t.icon }}</span>
            <span class="font-label text-label-md">{{ t.label }}</span>
          </button>
        </div>

        <pulse-admin-users *ngIf="active === 'users'"></pulse-admin-users>
        <pulse-admin-reports *ngIf="active === 'reports'"></pulse-admin-reports>
        <pulse-admin-content *ngIf="active === 'content'"></pulse-admin-content>
        <pulse-admin-premium *ngIf="active === 'premium'"></pulse-admin-premium>
        <pulse-admin-social *ngIf="active === 'social'"></pulse-admin-social>
        <pulse-admin-broadcast *ngIf="active === 'broadcast' && isAdmin"></pulse-admin-broadcast>
        <pulse-admin-settings *ngIf="active === 'settings' && isAdmin"></pulse-admin-settings>
        <pulse-admin-audit *ngIf="active === 'audit' && isAdmin"></pulse-admin-audit>
      </div>
    </div>
  `,
  styles: [`
    .sidebar-item {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 16px; color: var(--color-on-surface-variant);
      cursor: pointer; transition: all 0.2s ease; text-decoration: none;
      border-radius: 12px 12px 0 0; position: relative; background: transparent; border: none;
    }
    .sidebar-item:hover { color: var(--color-on-surface); background: rgba(255,255,255,0.04); }
    .sidebar-item.active { color: var(--color-on-surface); background: rgba(247,172,255,0.08); font-weight: 600; }
    .sidebar-item.active::after {
      content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px;
      background: var(--color-primary);
    }
  `]
})
export class AdminPageComponent implements OnInit {
  stats: AdminStats = {
    totalUsers: 0, onlineUsers: 0, todaySignups: 0, totalMatches: 0, pendingReports: 0,
    premiumUsers: 0, bannedUsers: 0, activeMatches: 0, totalFriends: 0, totalMessages: 0,
    totalCoins: 0, totalSubscriptions: 0,
  };
  loading = true;
  error = '';
  isAdmin = false;
  active = 'users';

  tabs: TabDef[] = [
    { id: 'users', label: 'Users', icon: 'group', adminOnly: false },
    { id: 'reports', label: 'Reports', icon: 'flag', adminOnly: false },
    { id: 'content', label: 'Content', icon: 'forum', adminOnly: false },
    { id: 'premium', label: 'Premium', icon: 'workspace_premium', adminOnly: false },
    { id: 'social', label: 'Social', icon: 'share', adminOnly: false },
    { id: 'broadcast', label: 'Broadcast', icon: 'campaign', adminOnly: true },
    { id: 'settings', label: 'System', icon: 'settings', adminOnly: true },
    { id: 'audit', label: 'Audit Log', icon: 'history', adminOnly: true },
  ];

  constructor(private adminService: AdminService, private authService: AuthService) {}

  ngOnInit(): void {
    const u = this.authService.getCurrentUser();
    this.isAdmin = !!u && u.role === 'ADMIN';
    this.adminService.getStats().subscribe({
      next: (s) => { this.stats = s; this.loading = false; },
      error: () => { this.error = 'Failed to load admin data.'; this.loading = false; },
    });
  }
}
