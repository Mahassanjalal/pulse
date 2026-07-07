import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { PremiumService, Plan } from '../../core/services/premium.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'pulse-premium',
  template: `
    <div class="p-lg md:p-xl max-w-6xl mx-auto">
      <!-- Header -->
      <div class="text-center mb-xl">
        <div class="inline-block px-md py-xs rounded-full bg-primary/20 border border-primary/30 mb-lg">
          <span class="text-[10px] font-black uppercase tracking-widest text-primary">Limited Offer</span>
        </div>
        <h1 class="font-display-lg text-display-lg text-white mb-md">Pulse Premium Experience</h1>
        <p class="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">Elevate your connections with advanced targeting and cinematic streaming quality. See who's truly matching your vibe.</p>
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="flex justify-center py-xl">
        <span class="material-symbols-outlined text-4xl text-primary pulse-animation">sync</span>
      </div>

      <!-- Error -->
      <div *ngIf="error" class="text-center py-xl text-error">
        <p>{{ error }}</p>
        <button (click)="loadPlans()" class="mt-md text-primary hover:underline">Retry</button>
      </div>

      <!-- Pricing -->
      <div *ngIf="!loading && !error" class="grid grid-cols-1 md:grid-cols-3 gap-lg mb-xl">
        <div *ngFor="let plan of plans" class="glass-panel rounded-3xl p-xl border border-white/10 flex flex-col relative" [ngClass]="{'border-primary/40': plan.popular}">
          <div *ngIf="plan.popular" class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-lg py-xs rounded-full text-[10px] font-black uppercase tracking-widest">Most Popular</div>
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
            <button (click)="subscribe(plan.id)" [disabled]="subscribing"
              class="w-full py-md rounded-xl font-headline-md text-headline-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              [class]="plan.popular ? 'bg-primary text-on-primary neon-glow-primary' : 'glass-panel text-on-surface border border-white/10 hover:bg-white/10'">
              <span *ngIf="subscribing" class="material-symbols-outlined animate-spin text-sm inline-block mr-sm">sync</span>
              {{ subscribing ? 'Processing...' : (plan.popular ? 'Upgrade to ' + plan.name : 'Get ' + plan.name) }}
            </button>
          </ng-container>
          <ng-template #manageBlock>
            <div class="text-center py-md px-md rounded-xl bg-tertiary/10 border border-tertiary/20">
              <p class="font-label-md text-label-md text-tertiary mb-sm">Subscribed ✓</p>
              <button (click)="cancelSubscription()" class="text-xs text-on-surface-variant hover:text-error transition-colors">Cancel Subscription</button>
            </div>
          </ng-template>
        </div>
      </div>

      <!-- Features Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <div *ngFor="let feature of premiumFeatures" class="glass-panel p-xl rounded-2xl border border-white/10 flex items-start gap-md">
          <div class="w-12 h-12 rounded-full flex items-center justify-center shrink-0" [class]="feature.bg">
            <span class="material-symbols-outlined" [class]="feature.iconColor">{{ feature.icon }}</span>
          </div>
          <div>
            <h4 class="font-label-md text-label-md text-white font-bold mb-xs">{{ feature.title }}</h4>
            <p class="text-sm text-on-surface-variant">{{ feature.desc }}</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class PremiumPageComponent implements OnInit {
  plans: Plan[] = [];
  loading = true;
  error = '';
  subscribing = false;
  isPremium = false;

  constructor(
    private premiumService: PremiumService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.authService.user$.subscribe(user => {
      this.isPremium = user?.isPremium || false;
    });
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
      },
      error: (err) => {
        this.error = err.error?.error || 'Subscription failed. Please try again.';
        this.subscribing = false;
      }
    });
  }

  cancelSubscription(): void {
    if (confirm('Are you sure you want to cancel your subscription?')) {
      this.premiumService.cancel().subscribe({
        next: () => {
          this.authService.fetchCurrentUser().subscribe();
        },
        error: () => {
          this.error = 'Failed to cancel subscription.';
        }
      });
    }
  }

  premiumFeatures = [
    { icon: 'person_add', title: 'Send & Accept Friend Requests', desc: 'Connect with people you vibe with. Send and accept friend requests to build your network.', bg: 'bg-secondary-fixed/20', iconColor: 'text-secondary-fixed' },
    { icon: 'wc', title: 'Gender & Location Filters', desc: 'Find exactly who you\'re looking for with advanced gender and location filters.', bg: 'bg-primary/20', iconColor: 'text-primary' },
    { icon: 'hd', title: 'HD Video Quality', desc: 'Crystal clear 720p/1080p discovery with enhanced low-light mode.', bg: 'bg-tertiary/20', iconColor: 'text-tertiary' },
    { icon: 'public', title: 'Global Travel Mode', desc: 'Match with any country instantly, no restrictions.', bg: 'bg-yellow-400/20', iconColor: 'text-yellow-400' },
    { icon: 'ad_off', title: 'Ad-Free Experience', desc: 'No interruptions, just pure discovery.', bg: 'bg-primary/20', iconColor: 'text-primary' },
    { icon: 'verified', title: 'Premium Badge', desc: 'Stand out with an exclusive Premium badge on your profile.', bg: 'bg-secondary-fixed/20', iconColor: 'text-secondary-fixed' },
    { icon: 'support_agent', title: 'Priority Support', desc: 'Get help faster with priority access to our support team.', bg: 'bg-primary/20', iconColor: 'text-primary' },
    { icon: 'visibility_off', title: 'Incognito Mode', desc: 'Browse profiles discreetly without being seen.', bg: 'bg-tertiary/20', iconColor: 'text-tertiary' },
  ];
}
