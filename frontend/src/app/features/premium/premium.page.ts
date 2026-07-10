import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { PremiumService } from '../../core/services/premium.service';
import { AuthService } from '../../core/services/auth.service';
import { PremiumPlan } from '@models/user.model';

@Component({
  selector: 'pulse-premium',
  template: `
    <div class="p-lg md:p-xl max-w-6xl mx-auto">
      <!-- Success banner -->
      <div *ngIf="justUpgraded" class="mb-xl flex items-center gap-md p-lg rounded-2xl bg-tertiary/10 border border-tertiary/30">
        <span class="material-symbols-outlined text-tertiary">celebration</span>
        <p class="font-label-md text-label-md text-on-surface">Welcome to Pulse Premium! Your account has been upgraded.</p>
      </div>

      <!-- Header -->
      <div class="text-center mb-xl">
        <div class="inline-block px-md py-xs rounded-full bg-primary/20 border border-primary/30 mb-lg">
          <span class="text-[10px] font-black uppercase tracking-widest text-primary">Limited Offer</span>
        </div>
        <h1 class="font-display-lg text-display-lg text-white mb-md">Pulse Premium Experience</h1>
        <p class="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">Elevate your connections with advanced targeting and cinematic streaming quality. See who's truly matching your vibe.</p>
      </div>

      <!-- Pricing -->
      <pulse-plan-list
        [plans]="plans"
        [loading]="loading"
        [error]="error"
        [isPremium]="isPremium"
        [subscribing]="subscribing"
        (retry)="loadPlans()"
        (subscribe)="subscribe($event)">
      </pulse-plan-list>

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

      <p *ngIf="cancelError" class="text-center text-error mt-lg">{{ cancelError }}</p>
    </div>

    <!-- Cancel Confirmation Modal -->
    <div *ngIf="showCancelConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" (click)="showCancelConfirm = false" role="dialog" aria-modal="true" aria-labelledby="cancel-confirm-title">
      <div class="glass-panel rounded-2xl border border-white/10 p-xl max-w-md w-full mx-md" (click)="$event.stopPropagation()">
        <div class="flex items-center justify-between mb-lg">
          <h3 id="cancel-confirm-title" class="font-headline text-headline-md text-on-surface">Cancel Subscription</h3>
          <button (click)="showCancelConfirm = false" type="button" class="material-symbols-outlined text-on-surface-variant hover:text-on-surface" aria-label="Close dialog">close</button>
        </div>
        <p class="text-on-surface-variant mb-lg">Are you sure you want to cancel your subscription? You will lose access to all premium features at the end of your billing period.</p>
        <div class="flex gap-md">
          <button (click)="showCancelConfirm = false" type="button" class="flex-1 py-md glass-panel rounded-xl text-on-surface border border-white/10 hover:bg-white/5 transition-all">Keep Subscription</button>
          <button (click)="cancelSubscription()" type="button" class="flex-1 py-md bg-error text-on-error rounded-xl font-bold hover:brightness-110 active:scale-95 transition-all">Cancel</button>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class PremiumPageComponent implements OnInit {
  plans: PremiumPlan[] = [];
  loading = true;
  error = '';
  subscribing = false;
  isPremium = false;
  showCancelConfirm = false;
  cancelError = '';
  justUpgraded = false;

  constructor(
    private premiumService: PremiumService,
    private authService: AuthService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.authService.user$.subscribe(user => {
      this.isPremium = user?.isPremium || false;
    });
    this.loadPlans();

    // If we returned from Stripe Checkout, verify the session and grant premium.
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');
    if (sessionId) {
      this.premiumService.getCheckoutStatus(sessionId).subscribe({
        next: () => {
          this.justUpgraded = true;
          this.authService.fetchCurrentUser().subscribe();
        },
        error: () => this.authService.fetchCurrentUser().subscribe(),
      });
    }
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
    this.error = '';
    this.premiumService.createCheckout(planId).subscribe({
      next: (res: any) => {
        if (res.url) {
          // Redirect to Stripe Checkout; we return to /premium/success after payment.
          window.location.href = res.url;
          return;
        }
        // Dev mode (no Stripe keys): premium granted directly.
        this.authService.fetchCurrentUser().subscribe();
        this.subscribing = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Subscription failed. Please try again.';
        this.subscribing = false;
      }
    });
  }

  openCancelConfirm(): void {
    this.showCancelConfirm = true;
    this.cancelError = '';
  }

  cancelSubscription(): void {
    this.showCancelConfirm = false;
    this.premiumService.cancel().subscribe({
      next: () => {
        this.authService.fetchCurrentUser().subscribe();
      },
      error: () => {
        this.cancelError = 'Failed to cancel subscription.';
      }
    });
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
