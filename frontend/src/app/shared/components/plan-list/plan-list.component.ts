import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PremiumPlan } from '@models/user.model';

/**
 * Shared plan-card list used by both the premium page and the premium modal.
 * It only renders the loading / error / plan-card UI. Subscription logic lives
 * in the parent (which knows whether to close a modal or refresh on dev-mode
 * grant), communicated via the `subscribe` output.
 */
@Component({
  selector: 'pulse-plan-list',
  template: `
    <div *ngIf="loading" class="flex justify-center py-xl">
      <span class="material-symbols-outlined text-4xl text-primary pulse-animation">sync</span>
    </div>

    <div *ngIf="error" class="text-center py-xl text-error">
      <p>{{ error }}</p>
      <button (click)="retry.emit()" class="mt-md text-primary hover:underline">Retry</button>
    </div>

    <div *ngIf="!loading && !error" class="grid grid-cols-1 md:grid-cols-3 gap-lg mb-xl">
      <div *ngFor="let plan of plans" class="glass-panel rounded-3xl p-xl border border-white/10 flex flex-col relative" [ngClass]="{'border-primary/40': plan.popular}">
        <div *ngIf="plan.popular" class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-lg py-xs rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Most Popular</div>
        <div class="text-center mb-lg">
          <h3 class="font-headline-md text-headline-md text-on-surface mb-md">{{ plan.name }}</h3>
          <div class="flex items-baseline justify-center gap-xs">
            <span class="font-display-lg text-display-lg font-black text-white">\${{ plan.price }}</span>
            <span class="text-on-surface-variant font-label-md text-label-md">/mo</span>
          </div>
        </div>
        <ul class="space-y-md mb-xl flex-1">
          <li *ngFor="let feature of plan.features" class="flex items-center gap-md font-label-sm text-label-sm text-on-surface">
            <span class="material-symbols-outlined text-tertiary text-sm">check_circle</span>
            {{ feature }}
          </li>
        </ul>
        <ng-container *ngIf="!isPremium; else manageBlock">
          <button (click)="subscribe.emit(plan.id)" [disabled]="subscribing"
            class="w-full py-md rounded-xl font-headline-md text-headline-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            [class]="plan.popular ? 'bg-primary text-on-primary neon-glow-primary' : 'glass-panel text-on-surface border border-white/10 hover:bg-white/10'">
            <span *ngIf="subscribing" class="material-symbols-outlined animate-spin text-sm inline-block mr-sm">sync</span>
            {{ subscribing ? 'Processing...' : (plan.popular ? 'Upgrade to ' + plan.name : 'Get ' + plan.name) }}
          </button>
        </ng-container>
        <ng-template #manageBlock>
          <div class="text-center py-md px-md rounded-xl bg-tertiary/10 border border-tertiary/20">
            <p class="font-label-md text-label-md text-tertiary mb-sm">Subscribed ✓</p>
          </div>
        </ng-template>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class PlanListComponent {
  @Input() plans: PremiumPlan[] = [];
  @Input() loading = true;
  @Input() error = '';
  @Input() isPremium = false;
  @Input() subscribing = false;
  @Output() retry = new EventEmitter<void>();
  @Output() subscribe = new EventEmitter<string>();
}
