import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { AdminService, AdminSubscription, AdminCoinPackage } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'pulse-admin-premium',
  template: `
    <div class="space-y-lg">
      <section>
        <h2 class="font-headline-md text-headline-md text-on-surface mb-md">Subscriptions</h2>
        <div *ngIf="subLoading" class="text-on-surface-variant py-sm">Loading…</div>
        <div *ngFor="let s of subs" class="glass-panel rounded-xl p-md mb-sm flex items-center justify-between gap-md">
          <div class="text-sm text-on-surface">
            @{{ s.user?.username || s.userId }} · <span class="text-primary">{{ s.planType }}</span>
            <span class="ml-2 text-xs text-on-surface-variant">{{ s.period }} · {{ '$' }}{{ s.price }} · {{ s.isActive ? 'active' : 'inactive' }}</span>
            <span class="block text-xs text-on-surface-variant">ends {{ s.endDate | date:'short' }}</span>
          </div>
          <div class="flex items-center gap-2" *ngIf="isAdmin">
            <select [value]="s.isActive ? 'true' : 'false'" (change)="toggleSub(s, $event)">
              <option value="true">Active</option><option value="false">Inactive</option>
            </select>
          </div>
        </div>
        <pulse-admin-paginator [page]="subPage" [limit]="subLimit" [total]="subTotal" (pageChange)="onSubPage($event)"></pulse-admin-paginator>
      </section>

      <section *ngIf="isAdmin">
        <div class="flex items-center justify-between mb-md">
          <h2 class="font-headline-md text-headline-md text-on-surface">Coin Packages</h2>
          <button (click)="openCreate()" class="text-xs px-3 py-1.5 rounded bg-primary text-on-primary">+ New package</button>
        </div>
        <div *ngIf="pkgLoading" class="text-on-surface-variant py-sm">Loading…</div>
        <div class="glass-panel rounded-2xl overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-white/5 text-on-surface-variant"><tr><th class="p-md">ID</th><th class="p-md">Name</th><th class="p-md">Coins</th><th class="p-md">Bonus</th><th class="p-md">Price</th><th class="p-md">Actions</th></tr></thead>
            <tbody>
              <tr *ngFor="let p of packages" class="border-t border-white/5">
                <td class="p-md text-on-surface">{{ p.id }}</td>
                <td class="p-md text-on-surface">{{ p.name }}</td>
                <td class="p-md text-on-surface">{{ p.coins }}</td>
                <td class="p-md text-on-surface">{{ p.bonus }}</td>
                <td class="p-md text-on-surface">\${{ p.priceUsd }}</td>
                <td class="p-md flex gap-2">
                  <button (click)="editPkg(p)" class="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">Edit</button>
                  <button (click)="delPkg(p)" class="text-xs px-2 py-1 rounded bg-error/20 text-error hover:bg-error/30">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div *ngIf="modalOpen" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" (click)="modalOpen = false">
        <div class="w-full max-w-sm bg-surface rounded-2xl p-lg border border-white/10" (click)="$event.stopPropagation()">
          <h3 class="font-headline-sm text-headline-sm text-on-surface mb-md">{{ editing?.id ? 'Edit' : 'New' }} coin package</h3>
          <div class="space-y-2">
            <input [(ngModel)]="form.id" [disabled]="!!editing?.id" placeholder="id (coins_xxx)" class="w-full bg-surface-container text-on-surface rounded px-2 py-1" />
            <input [(ngModel)]="form.name" placeholder="name" class="w-full bg-surface-container text-on-surface rounded px-2 py-1" />
            <input [(ngModel)]="form.coins" type="number" placeholder="coins" class="w-full bg-surface-container text-on-surface rounded px-2 py-1" />
            <input [(ngModel)]="form.bonus" type="number" placeholder="bonus" class="w-full bg-surface-container text-on-surface rounded px-2 py-1" />
            <input [(ngModel)]="form.priceUsd" type="number" placeholder="priceUsd" class="w-full bg-surface-container text-on-surface rounded px-2 py-1" />
            <label class="flex items-center gap-2 text-sm text-on-surface-variant"><input type="checkbox" [(ngModel)]="form.popular" /> Popular</label>
          </div>
          <div class="flex gap-2 mt-md">
            <button (click)="savePkg()" class="flex-1 px-3 py-2 rounded bg-primary text-on-primary">Save</button>
            <button (click)="modalOpen = false" class="flex-1 px-3 py-2 rounded bg-white/10">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class AdminPremiumComponent implements OnInit {
  subs: AdminSubscription[] = []; packages: AdminCoinPackage[] = [];
  subLoading = true; pkgLoading = true; isAdmin = false;
  editing: AdminCoinPackage | null = null;
  modalOpen = false;
  form: AdminCoinPackage = { id: '', name: '', coins: 0, priceUsd: 0, bonus: 0, popular: false };
  subPage = 1; subLimit = 20; subTotal = 0;

  constructor(private admin: AdminService, private auth: AuthService) {}

  ngOnInit(): void {
    const u = this.auth.getCurrentUser();
    this.isAdmin = !!u && u.role === 'ADMIN';
    this.loadSubs(); this.loadPkgs();
  }
  loadSubs(): void {
    this.subLoading = true;
    this.admin.listSubscriptions(this.subPage, this.subLimit).subscribe({ next: (r) => { this.subs = r.subscriptions; this.subTotal = r.total; this.subLoading = false; }, error: () => { this.subLoading = false; } });
  }
  onSubPage(p: number): void { this.subPage = p; this.loadSubs(); }
  loadPkgs(): void {
    this.pkgLoading = true;
    this.admin.listCoinPackages().subscribe({ next: (r) => { this.packages = r.packages; this.pkgLoading = false; }, error: () => { this.pkgLoading = false; } });
  }
  toggleSub(s: AdminSubscription, e: Event): void {
    const isActive = (e.target as HTMLSelectElement).value === 'true';
    this.admin.updateSubscription(s.userId, { isActive }).subscribe({ next: () => { s.isActive = isActive; } });
  }
  openCreate(): void {
    this.editing = {} as AdminCoinPackage;
    this.form = { id: '', name: '', coins: 0, priceUsd: 0, bonus: 0, popular: false };
    this.modalOpen = true;
  }
  editPkg(p: AdminCoinPackage): void {
    this.editing = p;
    this.form = { ...p };
    this.modalOpen = true;
  }
  savePkg(): void {
    if (this.editing?.id) {
      this.admin.updateCoinPackage(this.editing.id, this.form).subscribe({ next: () => { this.modalOpen = false; this.loadPkgs(); }, error: () => alert('Update failed') });
    } else {
      this.admin.createCoinPackage(this.form).subscribe({ next: () => { this.modalOpen = false; this.loadPkgs(); }, error: () => alert('Create failed') });
    }
  }
  delPkg(p: AdminCoinPackage): void {
    if (!confirm('Delete package ' + p.id + '?')) return;
    this.admin.deleteCoinPackage(p.id).subscribe({ next: () => { this.loadPkgs(); } });
  }
}
