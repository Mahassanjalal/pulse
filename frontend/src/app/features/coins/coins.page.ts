import { Component, OnInit, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { CoinService } from '../../core/services/coin.service';
import { AuthService } from '../../core/services/auth.service';
import { CoinPackage, CoinTransaction } from '@models/user.model';

@Component({
  selector: 'pulse-coins',
  template: `
    <div class="p-lg md:p-xl max-w-6xl mx-auto">
      <!-- Balance + back -->
      <div class="flex items-center justify-between mb-xl">
        <div>
          <h1 class="font-display-lg text-display-lg text-white">Get Gems</h1>
          <p class="font-body-lg text-body-lg text-on-surface-variant">Spend Gems on gifts, boosts, and super likes to stand out.</p>
        </div>
        <div class="glass-panel rounded-2xl px-lg py-md border border-white/10 flex items-center gap-sm">
          <span class="material-symbols-outlined text-primary" style="font-variation-settings: 'FILL' 1;">account_balance_wallet</span>
          <span class="font-headline-md text-headline-md text-primary">{{ user?.coins || 0 }}</span>
        </div>
      </div>

      <!-- Packages -->
      <div *ngIf="loading" class="flex justify-center py-xl">
        <span class="material-symbols-outlined text-4xl text-primary pulse-animation">sync</span>
      </div>

      <div *ngIf="error" class="text-center py-xl text-error">
        <p>{{ error }}</p>
        <button (click)="loadPackages()" class="mt-md text-primary hover:underline">Retry</button>
      </div>

      <div *ngIf="!loading && !error" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg mb-xl">
        <div *ngFor="let pkg of packages" class="glass-panel rounded-3xl p-xl border border-white/10 flex flex-col relative" [ngClass]="{'border-primary/40': pkg.popular}">
          <div *ngIf="pkg.popular" class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-lg py-xs rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Best Value</div>
          <div class="text-center mb-lg">
            <h3 class="font-headline-md text-headline-md text-on-surface mb-md">{{ pkg.name }}</h3>
            <div class="flex items-baseline justify-center gap-xs">
              <span class="font-display-lg text-display-lg font-black text-white">{{ pkg.coins + pkg.bonus }}</span>
              <span class="text-on-surface-variant font-label-md text-label-md">gems</span>
            </div>
            <p *ngIf="pkg.bonus" class="text-xs text-tertiary mt-xs">+{{ pkg.bonus }} bonus</p>
          </div>
          <button (click)="buy(pkg.id)" [disabled]="buying === pkg.id"
            class="w-full py-md rounded-xl font-headline-md text-headline-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            [class]="pkg.popular ? 'bg-primary text-on-primary neon-glow-primary' : 'glass-panel text-on-surface border border-white/10 hover:bg-white/10'">
            <span *ngIf="buying === pkg.id" class="material-symbols-outlined animate-spin text-sm inline-block mr-sm">sync</span>
            {{ buying === pkg.id ? 'Processing...' : '$' + pkg.priceUsd }}
          </button>
        </div>
      </div>

      <!-- How to earn -->
      <div class="glass-panel rounded-3xl p-xl border border-white/10 mb-xl">
        <h3 class="font-headline-md text-headline-md text-white mb-md flex items-center gap-sm">
          <span class="material-symbols-outlined text-tertiary">auto_awesome</span> Earn free Gems daily
        </h3>
        <p class="text-on-surface-variant">Claim your <span class="text-primary font-bold">+10 Gems</span> daily reward on the dashboard to keep your streak alive — no purchase needed.</p>
      </div>

      <!-- Recent transactions -->
      <div class="glass-panel rounded-3xl p-xl border border-white/10" *ngIf="transactions.length">
        <h3 class="font-headline-md text-headline-md text-white mb-lg">Recent Activity</h3>
        <ul class="space-y-md">
          <li *ngFor="let tx of transactions" class="flex items-center justify-between text-sm">
            <span class="text-on-surface-variant">{{ tx.reason }}</span>
            <span [class]="tx.amount >= 0 ? 'text-tertiary font-bold' : 'text-error font-bold'">
              {{ tx.amount >= 0 ? '+' : '' }}{{ tx.amount }}
            </span>
          </li>
        </ul>
      </div>

      <p *ngIf="buyError" class="text-center text-error mt-lg">{{ buyError }}</p>
    </div>
  `,
  styles: []
})
export class CoinsPageComponent implements OnInit {
  packages: CoinPackage[] = [];
  transactions: CoinTransaction[] = [];
  loading = true;
  error = '';
  buying: string | null = null;
  buyError = '';
  user: any;

  constructor(
    private coinService: CoinService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.authService.user$.subscribe(user => (this.user = user));
    this.loadPackages();
    this.coinService.getTransactions().subscribe({
      next: res => (this.transactions = res.transactions),
      error: () => {},
    });

    // If we returned from Stripe Checkout, verify the session and refresh balance.
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');
    if (sessionId) {
      this.coinService.getCheckoutStatus(sessionId).subscribe({
        next: () => this.authService.fetchCurrentUser().subscribe(),
        error: () => this.authService.fetchCurrentUser().subscribe(),
      });
    }
  }

  loadPackages(): void {
    this.loading = true;
    this.error = '';
    this.coinService.getPackages().subscribe({
      next: res => {
        this.packages = res.packages;
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load gem packages. Please try again.';
        this.loading = false;
      },
    });
  }

  buy(packageId: string): void {
    this.buying = packageId;
    this.buyError = '';
    this.coinService.createCheckout(packageId).subscribe({
      next: (res: any) => {
        if (res.url) {
          window.location.href = res.url;
          return;
        }
        // Dev mode (no Stripe keys): balance granted directly.
        this.authService.fetchCurrentUser().subscribe();
        this.buying = null;
      },
      error: (err) => {
        this.buyError = err.error?.error || 'Purchase failed. Please try again.';
        this.buying = null;
      },
    });
  }
}

@NgModule({
  declarations: [CoinsPageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: CoinsPageComponent }]),
    SharedModule,
  ],
})
export class CoinsModule {}
