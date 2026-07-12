import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminStats } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';

interface NavItem { id: string; label: string; icon: string; adminOnly: boolean; group: string; subtitle: string; }

@Component({
  selector: 'pulse-admin',
  template: `
    <div class="min-h-screen bg-background text-on-surface flex">
      <!-- Left navigation rail -->
      <aside class="w-64 shrink-0 hidden md:flex flex-col border-r border-white/5 bg-surface-container-lowest/60 backdrop-blur-xl sticky top-0 h-screen">
        <div class="px-6 py-6 border-b border-white/5">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-2xl">shield</span>
            <span class="font-display text-headline-md font-black text-primary tracking-tighter">Pulse Admin</span>
          </div>
          <p class="text-[10px] text-on-surface-variant/50 mt-1 uppercase tracking-[0.15em]">Control Center</p>
        </div>

        <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          <div *ngFor="let group of navGroups">
            <p class="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant/40">{{ group.name }}</p>
            <div class="space-y-1">
              <a *ngFor="let item of group.items"
                 [hidden]="item.adminOnly && !isAdmin"
                 class="admin-nav-item"
                 [routerLink]="['/admin', item.id]"
                 routerLinkActive="active">
                <span class="material-symbols-outlined text-[20px]"> {{ item.icon }}</span>
                <span class="font-label text-label-md">{{ item.label }}</span>
              </a>
            </div>
          </div>
        </nav>

        <div class="px-4 py-4 border-t border-white/5">
          <a class="admin-nav-item" routerLink="/dashboard">
            <span class="material-symbols-outlined text-[20px] text-on-surface-variant">logout</span>
            <span class="font-label text-label-md">Exit to app</span>
          </a>
        </div>
      </aside>

      <!-- Main column -->
      <div class="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <!-- Top header -->
        <header class="h-16 shrink-0 px-6 flex items-center justify-between border-b border-white/5 bg-surface-container-lowest/40 backdrop-blur-xl">
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-primary text-2xl md:hidden">shield</span>
            <div>
              <h1 class="font-headline-md text-headline-md leading-none text-on-surface">{{ currentLabel }}</h1>
              <p class="text-xs text-on-surface-variant mt-0.5">{{ currentSubtitle }}</p>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <div class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant text-xs">
              <span class="w-2 h-2 rounded-full bg-tertiary"></span> {{ stats.onlineUsers }} online
            </div>
            <div class="flex items-center gap-2">
              <div class="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">{{ adminInitial }}</div>
              <div class="hidden sm:block leading-tight">
                <p class="text-sm text-on-surface font-label">{{ adminName }}</p>
                <p class="text-[10px] text-on-surface-variant uppercase">{{ adminRole }}</p>
              </div>
            </div>
          </div>
        </header>

        <!-- Scroll area -->
        <div class="flex-1 overflow-y-auto">
          <div *ngIf="loading" class="flex justify-center items-center h-64">
            <span class="material-symbols-outlined text-3xl text-primary pulse-animation">sync</span>
          </div>
          <div *ngIf="error" class="text-center text-error py-xl">{{ error }}</div>

          <div *ngIf="!loading && !error" class="p-6 max-w-7xl mx-auto">
            <!-- KPI strip -->
            <div class="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
              <div class="glass-panel rounded-2xl p-4"><p class="text-on-surface-variant text-[10px] uppercase tracking-wide">Users</p><p class="font-display-md text-display-md text-on-surface">{{ stats.totalUsers }}</p></div>
              <div class="glass-panel rounded-2xl p-4"><p class="text-on-surface-variant text-[10px] uppercase tracking-wide">Premium</p><p class="font-display-md text-display-md text-primary">{{ stats.premiumUsers }}</p></div>
              <div class="glass-panel rounded-2xl p-4"><p class="text-on-surface-variant text-[10px] uppercase tracking-wide">Banned</p><p class="font-display-md text-display-md text-error">{{ stats.bannedUsers }}</p></div>
              <div class="glass-panel rounded-2xl p-4"><p class="text-on-surface-variant text-[10px] uppercase tracking-wide">Matches</p><p class="font-display-md text-display-md text-on-surface">{{ stats.totalMatches }}</p></div>
              <div class="glass-panel rounded-2xl p-4"><p class="text-on-surface-variant text-[10px] uppercase tracking-wide">Friends</p><p class="font-display-md text-display-md text-on-surface">{{ stats.totalFriends }}</p></div>
              <div class="glass-panel rounded-2xl p-4"><p class="text-on-surface-variant text-[10px] uppercase tracking-wide">Pending</p><p class="font-display-md text-display-md text-tertiary">{{ stats.pendingReports }}</p></div>
            </div>

            <router-outlet></router-outlet>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .admin-nav-item {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 14px; color: var(--color-on-surface-variant);
      cursor: pointer; transition: all 0.2s ease; text-decoration: none;
      border-radius: 14px;
    }
    .admin-nav-item:hover { background: rgba(255,255,255,0.04); color: var(--color-on-surface); }
    .admin-nav-item.active {
      color: var(--color-on-surface); background: rgba(247,172,255,0.10); font-weight: 600;
      box-shadow: inset 3px 0 0 var(--color-primary);
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

  adminName = '';
  adminRole = '';
  adminInitial = '';

  nav: NavItem[] = [
    { id: 'users', label: 'Users', icon: 'group', adminOnly: false, group: 'Manage', subtitle: 'Search, moderate, and manage every user account' },
    { id: 'reports', label: 'Reports', icon: 'flag', adminOnly: false, group: 'Manage', subtitle: 'Review and resolve moderation reports' },
    { id: 'content', label: 'Content', icon: 'forum', adminOnly: false, group: 'Manage', subtitle: 'Audit messages and matches across the platform' },
    { id: 'social', label: 'Social Graph', icon: 'share', adminOnly: false, group: 'Manage', subtitle: 'Inspect and manage friendships, requests, and blocks' },
    { id: 'premium', label: 'Premium & Billing', icon: 'workspace_premium', adminOnly: false, group: 'Manage', subtitle: 'Subscriptions and coin-package pricing' },
    { id: 'broadcast', label: 'Broadcast', icon: 'campaign', adminOnly: true, group: 'System', subtitle: 'Send a real-time notification to all users' },
    { id: 'settings', label: 'Settings', icon: 'settings', adminOnly: true, group: 'System', subtitle: 'Toggle platform-wide system configuration' },
    { id: 'audit', label: 'Audit Log', icon: 'history', adminOnly: true, group: 'System', subtitle: 'Trace every privileged administrative action' },
  ];

  navGroups = [
    { name: 'Manage', items: this.nav.filter(n => n.group === 'Manage') },
    { name: 'System', items: this.nav.filter(n => n.group === 'System') },
  ];

  constructor(
    private adminService: AdminService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const u = this.authService.getCurrentUser();
    this.isAdmin = !!u && u.role === 'ADMIN';
    this.adminName = u?.displayName || u?.username || 'Admin';
    this.adminRole = u?.role || '';
    this.adminInitial = (u?.displayName || u?.username || 'A').charAt(0).toUpperCase();
    this.adminService.getStats().subscribe({
      next: (s) => { this.stats = s; this.loading = false; },
      error: () => { this.error = 'Failed to load admin data.'; this.loading = false; },
    });
  }

  /** Derive the active section from the live child route so the header
      updates on every navigation (used by currentLabel/currentSubtitle). */
  get currentId(): string {
    return this.route.firstChild?.snapshot?.url[0]?.path || 'users';
  }
  get currentLabel(): string {
    return this.nav.find(n => n.id === this.currentId)?.label || 'Admin';
  }
  get currentSubtitle(): string {
    return this.nav.find(n => n.id === this.currentId)?.subtitle || '';
  }
}
