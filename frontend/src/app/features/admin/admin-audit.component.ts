import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/shared.module';
import { AdminService, AdminAuditEntry } from '../../core/services/admin.service';

@Component({
  selector: 'pulse-admin-audit',
  template: `
    <div class="glass-panel rounded-2xl overflow-hidden">
      <div *ngIf="loading" class="text-center text-on-surface-variant py-lg">Loading…</div>
      <table *ngIf="!loading" class="w-full text-left text-sm">
        <thead class="bg-white/5 text-on-surface-variant"><tr><th class="p-md">Time</th><th class="p-md">Admin</th><th class="p-md">Action</th><th class="p-md">Target</th></tr></thead>
        <tbody>
          <tr *ngFor="let l of logs" class="border-t border-white/5">
            <td class="p-md text-on-surface-variant">{{ l.createdAt | date:'medium' }}</td>
            <td class="p-md text-on-surface">{{ l.adminName }}</td>
            <td class="p-md text-on-surface">{{ l.action }}</td>
            <td class="p-md text-on-surface-variant">{{ l.targetType || '' }} {{ l.targetId || '' }}</td>
          </tr>
        </tbody>
      </table>
      <pulse-admin-paginator *ngIf="!loading" [page]="page" [limit]="limit" [total]="total" (pageChange)="onPage($event)"></pulse-admin-paginator>
    </div>
  `,
  styles: []
})
export class AdminAuditComponent implements OnInit {
  logs: AdminAuditEntry[] = [];
  loading = true; page = 1; limit = 20; total = 0;
  constructor(private admin: AdminService) {}
  ngOnInit(): void { this.load(); }
  load(): void {
    this.loading = true;
    this.admin.getAuditLog(this.page, this.limit).subscribe({ next: (r) => { this.logs = r.logs; this.total = r.total; this.loading = false; }, error: () => { this.loading = false; } });
  }
  onPage(p: number): void { this.page = p; this.load(); }
}
