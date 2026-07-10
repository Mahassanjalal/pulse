import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PremiumService } from '../../../core/services/premium.service';
import { PremiumPlan } from '../../../models/user.model';
import { AuthService } from '../../../core/services/auth.service';
import { SharedModule } from '../../../shared/shared.module';

@Component({
  selector: 'pulse-premium-modal',
  standalone: true,
  imports: [CommonModule, RouterModule, SharedModule],
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

        <pulse-plan-list
          [plans]="plans"
          [loading]="loading"
          [error]="error"
          [subscribing]="subscribing"
          (retry)="loadPlans()"
          (subscribe)="subscribe($event)">
        </pulse-plan-list>

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

  plans: PremiumPlan[] = [];
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
    this.premiumService.createCheckout(planId).subscribe({
      next: (res: any) => {
        if (res.url) {
          // Redirect to Stripe Checkout; returns to /premium/success after payment.
          window.location.href = res.url;
          return;
        }
        // Dev mode (no Stripe keys): premium granted directly.
        this.authService.fetchCurrentUser().subscribe({
          next: () => { this.subscribing = false; this.close(); },
        });
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
