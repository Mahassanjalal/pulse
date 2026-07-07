import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';

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

      <!-- Pricing -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-lg mb-xl">
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
          <button class="w-full py-md rounded-xl font-headline-md text-headline-md transition-all active:scale-95" [class]="plan.popular ? 'bg-primary text-on-primary neon-glow-primary' : 'glass-panel text-on-surface border border-white/10 hover:bg-white/10'">
            {{ plan.cta }}
          </button>
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
export class PremiumPageComponent {
  plans = [
    {
      name: 'Silver', price: 9.99, popular: false, cta: 'Get Silver',
      features: ['Ad-Free Experience', 'HD Video (720p)', 'Send & Accept Friend Requests', 'Advanced Filters (Gender & Location)', 'Basic Support', 'Silver Premium Badge']
    },
    {
      name: 'Gold', price: 19.99, popular: true, cta: 'Upgrade to Gold',
      features: ['Everything in Silver', 'Full HD Video (1080p)', 'Global Travel Mode', 'Incognito Mode', 'Priority Support', 'Gold Premium Badge', 'Custom Themes']
    },
    {
      name: 'Platinum', price: 29.99, popular: false, cta: 'Go Platinum',
      features: ['Everything in Gold', 'AI-Enhanced Matchmaking', 'Animated Premium Badge', '24/7 VIP Dedicated Support', 'Unlimited Global Travel', 'Exclusive Custom Themes', 'Priority in Matching Queue']
    }
  ];

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
