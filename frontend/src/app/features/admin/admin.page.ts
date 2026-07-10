import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminUser, AdminReport, AdminStats } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'pulse-admin',
  template: `
    <div class="p-lg md:p-xl max-w-6xl mx-auto">
      <h1 class="font-display-lg text-display-lg text-white mb-md">Admin Panel</h1>
      <p class="font-body-md text-body-md text-on-surface-variant mb-xl">Manage users, moderation, and platform stats.</p>

      <div *ngIf="loading" class="flex justify-center py-xl">
        <span class="material-symbols-outlined text-3xl text-primary pulse-animation">sync</span>
      </div>
      <div *ngIf="error" class="text-center text-error py-xl">{{ error }}</div>

      <div *ngIf="!loading && !error" class="grid grid-cols-2 md:grid-cols-5 gap-md mb-xl">
        <div class="glass-panel rounded-2xl p-md"><p class="text-on-surface-variant text-xs uppercase tracking-wide">Users</p><p class="font-display-md text-display-md text-white">{{ stats.totalUsers }}</p></div>
        <div class="glass-panel rounded-2xl p-md"><p class="text-on-surface-variant text-xs uppercase tracking-wide">Online</p><p class="font-display-md text-display-md text-tertiary">{{ stats.onlineUsers }}</p></div>
        <div class="glass-panel rounded-2xl p-md"><p class="text-on-surface-variant text-xs uppercase tracking-wide">Signups</p><p class="font-display-md text-display-md text-white">{{ stats.todaySignups }}</p></div>
        <div class="glass-panel rounded-2xl p-md"><p class="text-on-surface-variant text-xs uppercase tracking-wide">Matches</p><p class="font-display-md text-display-md text-white">{{ stats.totalMatches }}</p></div>
        <div class="glass-panel rounded-2xl p-md"><p class="text-on-surface-variant text-xs uppercase tracking-wide">Reports</p><p class="font-display-md text-display-md text-error">{{ stats.pendingReports }}</p></div>
      </div>

      <section class="mb-xl">
        <h2 class="font-headline-md text-headline-md text-on-surface mb-md">Users</h2>
        <div class="glass-panel rounded-2xl overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-white/5 text-on-surface-variant">
              <tr><th class="p-md">User</th><th class="p-md">Role</th><th class="p-md">Verified</th><th class="p-md">Trust</th><th class="p-md">Actions</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let u of users" class="border-t border-white/5">
                <td class="p-md text-on-surface">{{ u.displayName }} <span class="text-on-surface-variant text-xs">@{{ u.username }}</span></td>
                <td class="p-md">
                  <select [value]="u.role" (change)="changeRole(u, $event)" class="bg-surface-container text-on-surface rounded px-2 py-1">
                    <option value="USER">USER</option>
                    <option value="MODERATOR">MODERATOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
                <td class="p-md">{{ u.isVerified ? '✓' : '—' }}</td>
                <td class="p-md">{{ u.trustScore }}</td>
                <td class="p-md">
                  <button (click)="toggleVerified(u)" class="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors">{{ u.isVerified ? 'Unverify' : 'Verify' }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 class="font-headline-md text-headline-md text-on-surface mb-md">Pending Reports</h2>
        <div *ngIf="reports.length === 0" class="text-on-surface-variant text-sm">No reports.</div>
        <div *ngFor="let r of reports" class="glass-panel rounded-2xl p-md mb-md">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-on-surface">{{ r.category }} — <span class="text-on-surface-variant text-sm">{{ r.description }}</span></p>
              <p class="text-xs text-on-surface-variant">Reported: @{{ r.reportedUser.username }} · By: @{{ r.reporter.username }}</p>
            </div>
            <div class="flex gap-sm">
              <button (click)="review(r)" class="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20">Review</button>
              <button (click)="resolve(r)" class="text-xs px-3 py-1 rounded bg-primary text-on-primary">Resolve</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: []
})
export class AdminPageComponent implements OnInit {
  users: AdminUser[] = [];
  reports: AdminReport[] = [];
  stats: AdminStats = { totalUsers: 0, onlineUsers: 0, todaySignups: 0, totalMatches: 0, pendingReports: 0 };
  loading = true;
  error = '';

  constructor(
    private adminService: AdminService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    Promise.all([
      this.adminService.getStats().toPromise(),
      this.adminService.listUsers().toPromise(),
      this.adminService.listReports().toPromise(),
    ]).then(([stats, users, reports]) => {
      if (stats) this.stats = stats;
      if (users) this.users = users.users;
      if (reports) this.reports = reports.reports;
      this.loading = false;
    }).catch(() => {
      this.error = 'Failed to load admin data.';
      this.loading = false;
    });
  }

  changeRole(u: AdminUser, event: Event): void {
    const role = (event.target as HTMLSelectElement).value as any;
    this.adminService.setRole(u.id, role).subscribe({ next: (res) => { u.role = res.user.role; } });
  }

  toggleVerified(u: AdminUser): void {
    this.adminService.setVerified(u.id, !u.isVerified).subscribe({ next: (res) => { u.isVerified = res.user.isVerified; } });
  }

  review(r: AdminReport): void {
    this.adminService.reviewReport(r.id).subscribe({ next: (res) => { r.status = res.report.status; } });
  }

  resolve(r: AdminReport): void {
    this.adminService.resolveReport(r.id).subscribe({ next: (res) => { r.status = res.report.status; this.reports = this.reports.filter(x => x.id !== r.id); } });
  }
}
