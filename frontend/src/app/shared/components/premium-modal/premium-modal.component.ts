import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PremiumService, Plan } from '../../../core/services/premium.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'pulse-premium-modal',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-lg" (click)="close()">
      <div class="glass-panel w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl p-xl relative" (click)="$event.stopPropagation()">
        <button (click)="close()" class="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all">
          <span class="material-symbols-outlined">close</span>
        </button>

        <div class="text-center mb-xl">
          <div class="inline-block px-md py-xs rounded-full bg-primary/20 border border-primary/30 mb-lg">
            <span class="text-[10px] font-black uppercase tracking-widest text-primary">Limited Offer</span>
          </div>
          <h2 class="font-display-lg text-display-lg text-white mb-md">Upgrade Your Experience</h2>
          <p class="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">Unlock premium features and take your connections to the next level.</p>
        </div>

        <div *ngIf="loading" class="flex justify-center py-xl">
          <span class="material-symbols-outlined text-4xl text-primary pulse-animation">sync</span>
        </div>

        <div *ngIf="error" class="text-center py-xl text-error">
          <p>{{ error }}</p>
          <button (click)="loadPlans()" class="mt-md text-primary hover:underline">Retry</button>
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
            <button (click)="subscribe(plan.id)" [disabled]="subscribing"
              class="w-full py-md rounded-xl font-headline-md text-headline-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              [ngClass]="plan.popular ? 'bg-primary text-on-primary neon-glow-primary' : 'glass-panel text-on-surface border border-white/10 hover:bg-white/10'">
              <span *ngIf="subscribing" class="material-symbols-outlined animate-spin text-sm inline-block mr-sm">sync</span>
              {{ subscribing ? 'Processing...' : (plan.popular ? 'Upgrade to ' + plan.name : 'Get ' + plan.name) }}
            </button>
          </div>
        </div>

        <div class="text-center">
          <p class="text-on-surface-variant text-sm">Already have a subscription? <a routerLink="/settings" (click)="close()" class="text-primary hover:underline">Manage</a></p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }
  `]
})
export class PremiumModalComponent implements OnInit {
  @Output() closeModal = new EventEmitter<void>();

  plans: Plan[] = [];
  loading = true;
  error = '';
  subscribing = false;

  constructor(
    private premiumService: PremiumService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadPlans();
  }

  loadPlans(): void {
    this.loading = true;
    this.error = '';
    this.premiumService.getPlans().subscribe({
      next: (res) => {
        this.plans = res.plans;
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load plans. Please try again.';
        this.loading = false;
      }
    });
  }

  subscribe(planId: string): void {
    this.subscribing = true;
    this.premiumService.subscribe(planId).subscribe({
      next: () => {
        this.authService.fetchCurrentUser().subscribe();
        this.subscribing = false;
        this.close();
      },
      error: (err) => {
        this.error = err.error?.error || 'Subscription failed. Please try again.';
        this.subscribing = false;
      }
    });
  }

  close(): void {
    this.closeModal.emit();
  }
}
