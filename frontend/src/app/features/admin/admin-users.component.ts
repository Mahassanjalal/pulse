import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminUser, AdminUserDetail, AdminSession, AdminLoginHistory, AdminAchievement } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'pulse-admin-users',
  template: `
    <div class="space-y-md">
      <!-- Filters -->
      <div class="glass-panel rounded-2xl p-md flex flex-wrap items-end gap-md mb-6">
        <div class="flex-1 min-w-[200px]">
          <label class="text-xs text-on-surface-variant uppercase tracking-wide">Search</label>
          <input [(ngModel)]="search" (keyup.enter)="load()" placeholder="email, username, name"
                 class="w-full mt-1 bg-surface-container text-on-surface rounded-lg px-3 py-2 border border-white/5 focus:border-primary outline-none" />
        </div>
        <div>
          <label class="text-xs text-on-surface-variant uppercase tracking-wide">Role</label>
          <select [(ngModel)]="role" (change)="load()" class="mt-1 bg-surface-container text-on-surface rounded-lg px-3 py-2 border border-white/5">
            <option value="">All</option><option value="USER">USER</option><option value="MODERATOR">MODERATOR</option><option value="ADMIN">ADMIN</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-on-surface-variant uppercase tracking-wide">Status</label>
          <select [(ngModel)]="status" (change)="load()" class="mt-1 bg-surface-container text-on-surface rounded-lg px-3 py-2 border border-white/5">
            <option value="">All</option><option value="ONLINE">ONLINE</option><option value="OFFLINE">OFFLINE</option><option value="MATCHING">MATCHING</option>
          </select>
        </div>
        <button (click)="load()" class="px-4 py-2 rounded-lg bg-primary text-on-primary font-label">Search</button>
      </div>

      <div *ngIf="loading" class="text-center text-on-surface-variant py-lg">Loading…</div>
      <div *ngIf="!loading && error" class="text-error">{{ error }}</div>

      <div *ngIf="!loading && !error" class="glass-panel rounded-2xl overflow-hidden">
        <table class="w-full text-left text-sm">
          <thead class="bg-white/5 text-on-surface-variant">
            <tr><th class="p-md">User</th><th class="p-md">Role</th><th class="p-md">Status</th><th class="p-md">Verified</th><th class="p-md">Locked</th><th class="p-md">Coins</th><th class="p-md">Trust</th><th class="p-md">Actions</th></tr>
          </thead>
          <tbody>
            <tr *ngFor="let u of users" class="border-t border-white/5 hover:bg-white/5 cursor-pointer" (click)="open(u)">
              <td class="p-md text-on-surface">{{ u.displayName }} <span class="text-on-surface-variant text-xs">@{{ u.username }}</span></td>
              <td class="p-md"><span class="px-2 py-0.5 rounded-full text-xs" [class.bg-primary]="u.role != 'USER'" [class.text-primary]="u.role != 'USER'">{{ u.role }}</span></td>
              <td class="p-md text-on-surface-variant">{{ u.status }}</td>
              <td class="p-md">{{ u.isVerified ? '✓' : '—' }}</td>
              <td class="p-md">{{ u.isLocked ? '🔒' : '—' }}</td>
              <td class="p-md text-on-surface">{{ u.coins }}</td>
              <td class="p-md text-on-surface">{{ u.trustScore }}</td>
              <td class="p-md"><button (click)="$event.stopPropagation(); open(u)" class="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">Manage</button></td>
            </tr>
          </tbody>
        </table>
        <div class="flex items-center justify-between p-md text-sm text-on-surface-variant">
          <span>{{ total }} users</span>
          <div class="flex gap-2">
            <button [disabled]="page<=1" (click)="prev()" class="px-3 py-1 rounded bg-white/10 disabled:opacity-30">Prev</button>
            <button [disabled]="page*limit>=total" (click)="next()" class="px-3 py-1 rounded bg-white/10 disabled:opacity-30">Next</button>
          </div>
        </div>
      </div>

      <!-- Detail drawer -->
      <div *ngIf="detail" class="fixed inset-0 z-[60] flex justify-end bg-black/50" (click)="close()">
        <div class="w-full max-w-md bg-surface h-full overflow-y-auto p-lg border-l border-white/10" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-md">
            <h2 class="font-headline-md text-headline-md text-on-surface">{{ detail.displayName || detail.username }}</h2>
            <button (click)="close()" class="material-symbols-outlined text-on-surface-variant">close</button>
          </div>
          <p class="text-on-surface-variant text-sm mb-lg">{{ detail.email }} · @{{ detail.username }} · {{ detail.role }}</p>

          <div class="space-y-sm text-sm text-on-surface-variant mb-lg">
            <div>Premium: <span class="text-on-surface">{{ detail.isPremium ? 'Yes' : 'No' }}</span> · Locked: <span class="text-on-surface">{{ detail.isLocked ? 'Yes' : 'No' }}</span></div>
            <div>Coins: <span class="text-on-surface">{{ detail.coins }}</span> · Trust: <span class="text-on-surface">{{ detail.trustScore }}</span></div>
            <div>Friends: <span class="text-on-surface">{{ detail.friendsCount }}</span> · Conversations: <span class="text-on-surface">{{ detail.totalConversations }}</span></div>
          </div>

          <div class="space-y-sm">
            <div *ngIf="isAdmin" class="flex items-center gap-2">
              <select [value]="detail.role" (change)="changeRole($event)" class="bg-surface-container text-on-surface rounded px-2 py-1">
                <option value="USER">USER</option><option value="MODERATOR">MODERATOR</option><option value="ADMIN">ADMIN</option>
              </select>
              <span class="text-xs text-on-surface-variant">role</span>
            </div>

            <div class="flex gap-2">
              <button (click)="toggleVerified()" class="flex-1 text-xs px-3 py-2 rounded bg-white/10 hover:bg-white/20">{{ detail.isVerified ? 'Unverify' : 'Verify' }}</button>
              <button *ngIf="!detail.isLocked" (click)="lock()" class="flex-1 text-xs px-3 py-2 rounded bg-error/20 text-error hover:bg-error/30">Lock</button>
              <button *ngIf="detail.isLocked" (click)="unlock()" class="flex-1 text-xs px-3 py-2 rounded bg-tertiary/20 text-tertiary hover:bg-tertiary/30">Unlock</button>
            </div>

            <div class="flex items-center gap-2">
              <input type="number" [(ngModel)]="trustInput" class="flex-1 bg-surface-container text-on-surface rounded px-2 py-1" />
              <button (click)="setTrust()" class="text-xs px-3 py-2 rounded bg-white/10 hover:bg-white/20">Set trust</button>
            </div>

            <div *ngIf="isAdmin" class="flex items-center gap-2">
              <input type="number" [(ngModel)]="coinInput" placeholder="+/- coins" class="flex-1 bg-surface-container text-on-surface rounded px-2 py-1" />
              <button (click)="adjustCoins()" class="text-xs px-3 py-2 rounded bg-white/10 hover:bg-white/20">Adjust coins</button>
            </div>

            <div *ngIf="isAdmin" class="flex gap-2">
              <button (click)="togglePremium(true)" class="flex-1 text-xs px-3 py-2 rounded bg-primary/20 text-primary hover:bg-primary/30">Grant premium</button>
              <button (click)="togglePremium(false)" class="flex-1 text-xs px-3 py-2 rounded bg-white/10 hover:bg-white/20">Revoke premium</button>
            </div>

            <div *ngIf="isAdmin" class="flex items-center gap-2">
              <input type="number" [(ngModel)]="boostHours" placeholder="hours" class="flex-1 bg-surface-container text-on-surface rounded px-2 py-1" />
              <button (click)="boost()" class="text-xs px-3 py-2 rounded bg-white/10 hover:bg-white/20">Boost</button>
            </div>

            <button (click)="loadSessions()" class="w-full text-left text-xs px-3 py-2 rounded bg-white/10 hover:bg-white/20">View sessions & login history</button>
            <button (click)="loadAchievements()" class="w-full text-left text-xs px-3 py-2 rounded bg-white/10 hover:bg-white/20">Manage achievements</button>
          </div>

          <!-- Sessions -->
          <div *ngIf="sessions.length" class="mt-lg">
            <h3 class="text-on-surface font-label-md mb-sm">Sessions</h3>
            <div *ngFor="let s of sessions" class="flex items-center justify-between text-xs text-on-surface-variant mb-1">
              <span>{{ s.expiresAt | date:'short' }}</span>
              <button (click)="revokeSession(s)" class="px-2 py-0.5 rounded bg-error/20 text-error">Revoke</button>
            </div>
            <button (click)="revokeAll()" class="text-xs text-error mt-1">Revoke all sessions</button>
          </div>
          <div *ngIf="history.length" class="mt-lg">
            <h3 class="text-on-surface font-label-md mb-sm">Login history</h3>
            <div *ngFor="let h of history" class="text-xs text-on-surface-variant">{{ h.ipAddress }} · {{ h.device }} · {{ h.createdAt | date:'short' }}</div>
          </div>

          <!-- Achievements -->
          <div *ngIf="achievements.length" class="mt-lg">
            <h3 class="text-on-surface font-label-md mb-sm">Achievements</h3>
            <div *ngFor="let a of achievements" class="flex items-center justify-between text-xs mb-1">
              <span class="text-on-surface">{{ a.name }} <span class="text-on-surface-variant">{{ a.unlocked ? '✓' : '' }}</span></span>
              <div class="flex gap-1">
                <button *ngIf="isAdmin" (click)="revokeAch(a)" class="px-2 py-0.5 rounded bg-error/20 text-error">Revoke</button>
              </div>
            </div>
            <div *ngIf="isAdmin" class="flex gap-2 mt-2">
              <input [(ngModel)]="achInput" placeholder="achievement name" class="flex-1 bg-surface-container text-on-surface rounded px-2 py-1" />
              <button (click)="grantAch()" class="text-xs px-3 py-1 rounded bg-white/10">Grant</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class AdminUsersComponent implements OnInit {
  users: AdminUser[] = [];
  total = 0; page = 1; limit = 20;
  search = ''; role = ''; status = '';
  loading = true; error = '';

  detail: AdminUserDetail | null = null;
  isAdmin = false;
  sessions: AdminSession[] = []; history: AdminLoginHistory[] = [];
  achievements: AdminAchievement[] = [];

  trustInput = 50; coinInput = 0; boostHours = 1; achInput = '';

  constructor(private admin: AdminService, private auth: AuthService) {}

  ngOnInit(): void {
    const u = this.auth.getCurrentUser();
    this.isAdmin = !!u && u.role === 'ADMIN';
    this.load();
  }

  load(): void {
    this.loading = true; this.error = '';
    this.admin.listUsers(this.page, this.limit, { search: this.search, role: this.role, status: this.status }).subscribe({
      next: (r) => { this.users = r.users; this.total = r.total; this.loading = false; },
      error: () => { this.error = 'Failed to load users'; this.loading = false; },
    });
  }
  prev(): void { if (this.page > 1) { this.page--; this.load(); } }
  next(): void { if (this.page * this.limit < this.total) { this.page++; this.load(); } }

  open(u: AdminUser): void {
    this.detail = null; this.sessions = []; this.history = []; this.achievements = [];
    this.admin.getUser(u.id).subscribe({
      next: (r) => { this.detail = r.user; this.trustInput = r.user.trustScore; },
      error: () => {},
    });
  }
  close(): void { this.detail = null; }

  changeRole(e: Event): void {
    if (!this.detail) return;
    const role = (e.target as HTMLSelectElement).value as any;
    this.admin.setRole(this.detail.id, role).subscribe({ next: () => { if (this.detail) this.detail.role = role; } });
  }
  toggleVerified(): void {
    if (!this.detail) return;
    this.admin.setVerified(this.detail.id, !this.detail.isVerified).subscribe({ next: () => { if (this.detail) this.detail.isVerified = !this.detail.isVerified; } });
  }
  lock(): void {
    if (!this.detail) return;
    const reason = prompt('Lock reason?') || 'Locked by moderator';
    this.admin.lockUser(this.detail.id, reason).subscribe({ next: () => { if (this.detail) this.detail.isLocked = true; } });
  }
  unlock(): void {
    if (!this.detail) return;
    this.admin.unlockUser(this.detail.id).subscribe({ next: () => { if (this.detail) this.detail.isLocked = false; } });
  }
  setTrust(): void {
    if (!this.detail) return;
    this.admin.setTrust(this.detail.id, this.trustInput).subscribe({ next: (r) => { if (this.detail) this.detail.trustScore = r.trustScore ?? this.trustInput; } });
  }
  adjustCoins(): void {
    if (!this.detail) return;
    this.admin.adjustCoins(this.detail.id, this.coinInput).subscribe({ error: () => alert('Failed (check balance)') });
  }
  togglePremium(grant: boolean): void {
    if (!this.detail) return;
    this.admin.setPremium(this.detail.id, grant).subscribe({ next: () => { if (this.detail) this.detail.isPremium = grant; } });
  }
  boost(): void {
    if (!this.detail) return;
    this.admin.boostUser(this.detail.id, this.boostHours).subscribe({ error: () => {} });
  }
  loadSessions(): void {
    if (!this.detail) return;
    this.admin.getSessions(this.detail.id).subscribe({ next: (r) => { this.sessions = r.sessions; } });
    this.admin.getLoginHistory(this.detail.id).subscribe({ next: (r) => { this.history = r.history; } });
  }
  revokeSession(s: AdminSession): void {
    if (!this.detail) return;
    this.admin.revokeSession(this.detail.id, s.id).subscribe({ next: () => { this.sessions = this.sessions.filter(x => x.id !== s.id); } });
  }
  revokeAll(): void {
    if (!this.detail) return;
    this.admin.revokeAllSessions(this.detail.id).subscribe({ next: () => { this.sessions = []; } });
  }
  loadAchievements(): void {
    if (!this.detail) return;
    this.admin.getUserAchievements(this.detail.id).subscribe({ next: (r) => { this.achievements = r.achievements; } });
  }
  grantAch(): void {
    if (!this.detail || !this.achInput) return;
    this.admin.grantAchievement(this.detail.id, this.achInput).subscribe({
      next: () => { this.loadAchievements(); this.achInput = ''; },
    });
  }
  revokeAch(a: AdminAchievement): void {
    if (!this.detail) return;
    this.admin.revokeAchievement(this.detail.id, a.name).subscribe({ next: () => { this.achievements = this.achievements.filter(x => x.name !== a.name); } });
  }
}
