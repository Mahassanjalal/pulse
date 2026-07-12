import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { AdminService, AdminReport, AdminReportDetail } from '../../core/services/admin.service';

@Component({
  selector: 'pulse-admin-reports',
  template: `
    <div class="space-y-md">
      <div class="flex gap-2">
        <button *ngFor="let s of statuses" (click)="filter = s; page = 1; load()" class="text-xs px-3 py-1.5 rounded-lg" [ngClass]="filterClass(s)">{{ s }}</button>
      </div>

      <div *ngIf="loading" class="text-center text-on-surface-variant py-lg">Loading…</div>
      <div *ngIf="!loading && error" class="text-error">{{ error }}</div>

      <div *ngIf="!loading && !error && !detail" class="space-y-md">
        <div *ngFor="let r of reports" class="glass-panel rounded-2xl p-md">
          <div class="flex items-center justify-between">
            <div>
              <span class="px-2 py-0.5 rounded-full text-xs bg-error/20 text-error">{{ r.category }}</span>
              <span class="ml-2 text-xs text-on-surface-variant">{{ r.status }}</span>
              <p class="text-on-surface text-sm mt-1">{{ r.description }}</p>
              <p class="text-xs text-on-surface-variant mt-1">Reported: @{{ r.reportedUser.username }} · By: @{{ r.reporter.username }}</p>
            </div>
            <button (click)="open(r)" class="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20">Open</button>
          </div>
        </div>
        <div *ngIf="reports.length === 0" class="text-on-surface-variant text-sm">No reports.</div>
        <pulse-admin-paginator [page]="page" [limit]="limit" [total]="total" (pageChange)="onPage($event)"></pulse-admin-paginator>
      </div>

      <div *ngIf="detail" class="glass-panel rounded-2xl p-lg space-y-md">
        <div class="flex items-center justify-between">
          <h2 class="font-headline-md text-headline-md text-on-surface">Report detail</h2>
          <button (click)="detail = null" class="material-symbols-outlined text-on-surface-variant">close</button>
        </div>
        <span class="px-2 py-0.5 rounded-full text-xs bg-error/20 text-error">{{ detail.category }}</span>
        <p class="text-on-surface">{{ detail.description }}</p>
        <div class="text-sm text-on-surface-variant">
          Reporter: @{{ detail.reporter.username }} ({{ detail.reporter.id }})<br/>
          Reported: @{{ detail.reportedUser.username }} · trust {{ detail.reportedUser.trustScore }} · {{ detail.reportedUser.isLocked ? 'LOCKED' : 'active' }} · premium {{ detail.reportedUser.isPremium ? 'yes' : 'no' }}
        </div>
        <div class="flex flex-wrap gap-sm pt-2">
          <button (click)="review(detail)" class="text-xs px-3 py-1.5 rounded bg-white/10 hover:bg-white/20">Review</button>
          <button (click)="resolve(detail)" class="text-xs px-3 py-1.5 rounded bg-primary text-on-primary">Resolve</button>
          <button (click)="dismiss(detail)" class="text-xs px-3 py-1.5 rounded bg-white/10 hover:bg-white/20">Dismiss</button>
          <button (click)="actLock(detail)" class="text-xs px-3 py-1.5 rounded bg-error/20 text-error hover:bg-error/30">Lock reported user</button>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class AdminReportsComponent implements OnInit {
  reports: AdminReport[] = [];
  statuses = ['', 'PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED'];
  filter = ''; page = 1; limit = 20; total = 0;
  loading = true; error = '';
  detail: AdminReportDetail | null = null;

  constructor(private admin: AdminService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true; this.error = '';
    this.admin.listReports(this.filter, this.page, this.limit).subscribe({
      next: (r) => { this.reports = r.reports; this.total = r.total; this.loading = false; },
      error: () => { this.error = 'Failed to load reports'; this.loading = false; },
    });
  }
  onPage(p: number): void { this.page = p; this.load(); }
  filterClass(s: string): string {
    return this.filter === s ? 'bg-primary text-on-primary' : 'bg-white/10';
  }
  open(r: AdminReport): void {
    this.detail = null;
    this.admin.getReport(r.id).subscribe({ next: (res) => { this.detail = res.report; }, error: () => {} });
  }
  review(r: AdminReportDetail): void {
    this.admin.reviewReport(r.id).subscribe({ next: () => this.afterAction() });
  }
  resolve(r: AdminReportDetail): void {
    this.admin.resolveReport(r.id).subscribe({ next: () => this.afterAction() });
  }
  dismiss(r: AdminReportDetail): void {
    this.admin.dismissReport(r.id).subscribe({ next: () => this.afterAction() });
  }
  actLock(r: AdminReportDetail): void {
    this.admin.actOnReport(r.id, 'LOCK').subscribe({ next: () => this.afterAction() });
  }
  private afterAction(): void {
    this.detail = null;
    this.load();
  }
}
