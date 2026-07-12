import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminSystemSetting } from '../../core/services/admin.service';

@Component({
  selector: 'pulse-admin-settings',
  template: `
    <div class="glass-panel rounded-2xl p-lg max-w-xl mx-auto">
      <h2 class="font-headline-md text-headline-md text-on-surface mb-md">System Settings</h2>
      <p class="text-sm text-on-surface-variant mb-md">Toggled live; changes apply immediately on the server.</p>
      <div *ngFor="let s of settings" class="flex items-center justify-between py-2 border-b border-white/5">
        <div>
          <p class="text-on-surface font-label">{{ s.key }}</p>
          <p class="text-xs text-on-surface-variant">{{ s.description }}</p>
        </div>
        <div class="flex items-center gap-2">
          <input *ngIf="isBool(s)" type="checkbox" [(ngModel)]="boolVals[s.key]" (change)="mark(s.key)" />
          <input *ngIf="!isBool(s)" type="number" [(ngModel)]="numVals[s.key]" (change)="mark(s.key)"
                 class="bg-surface-container text-on-surface rounded px-2 py-1 w-20" />
        </div>
      </div>
      <button (click)="save()" [disabled]="saving"
              class="w-full mt-md px-4 py-2 rounded-lg bg-primary text-on-primary font-label disabled:opacity-40">
        {{ saving ? 'Saving…' : 'Save changes' }}
      </button>
    </div>
  `,
  styles: []
})
export class AdminSettingsComponent implements OnInit {
  settings: AdminSystemSetting[] = [];
  boolVals: Record<string, boolean> = {};
  numVals: Record<string, number> = {};
  dirty = new Set<string>();
  saving = false;

  constructor(private admin: AdminService) {}

  ngOnInit(): void {
    this.admin.getSettings().subscribe({ next: (r) => {
      this.settings = r.settings;
      for (const s of r.settings) {
        if (s.value === 'true' || s.value === 'false') this.boolVals[s.key] = s.value === 'true';
        else this.numVals[s.key] = Number(s.value);
      }
    }, error: () => {} });
  }
  isBool(s: AdminSystemSetting): boolean { return s.value === 'true' || s.value === 'false'; }
  mark(key: string): void { this.dirty.add(key); }
  save(): void {
    const payload: { key: string; value: string }[] = [];
    this.dirty.forEach((k) => {
      const s = this.settings.find(x => x.key === k)!;
      if (this.isBool(s)) payload.push({ key: k, value: String(this.boolVals[k]) });
      else payload.push({ key: k, value: String(this.numVals[k]) });
    });
    if (!payload.length) return;
    this.saving = true;
    this.admin.updateSettings(payload).subscribe({ next: () => { this.saving = false; this.dirty.clear(); }, error: () => { this.saving = false; alert('Save failed'); } });
  }
}
