import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';

interface DiscoverUser {
  name: string;
  age: number;
  location: string;
  avatar: string;
  interests: string[];
  isVerified: boolean;
  isPremium: boolean;
  isOnline: boolean;
  isTrending: boolean;
  languages: string;
}

@Component({
  selector: 'pulse-discover',
  template: `
    <div class="p-lg md:p-xl overflow-y-auto bg-surface-dim relative min-h-screen">
      <div class="absolute top-0 right-0 w-1/2 h-1/2 bg-primary/5 blur-[120px] pointer-events-none"></div>
      <div class="absolute bottom-0 left-0 w-1/2 h-1/2 bg-secondary-fixed/5 blur-[120px] pointer-events-none"></div>

      <div class="flex justify-between items-end mb-xl relative z-10">
        <div>
          <h1 class="font-headline-lg text-headline-lg text-on-surface mb-xs">Discovery</h1>
          <p class="font-body-lg text-body-lg text-on-surface-variant">Find people with similar vibes from around the world.</p>
        </div>
        <div class="flex items-center gap-md">
          <span class="font-label-md text-label-md text-on-surface-variant">Sort by:</span>
          <button class="glass-panel px-lg py-sm rounded-full font-label-md text-label-md flex items-center gap-xs">
            Recent Activity
            <span class="material-symbols-outlined text-sm">expand_more</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-lg relative z-10">
        <div *ngFor="let user of users" class="group relative aspect-[3/4] rounded-2xl overflow-hidden glass-panel shadow-2xl transition-all duration-500 hover:scale-[1.02] cursor-pointer border border-white/10">
          <div class="absolute inset-0">
            <img class="w-full h-full object-cover" [src]="user.avatar" alt="" />
          </div>
          <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity"></div>

          <div class="absolute top-md left-md flex items-center gap-sm" *ngIf="user.isOnline">
            <div class="relative flex items-center justify-center">
              <div class="absolute w-3 h-3 bg-tertiary rounded-full animate-pulse-ring"></div>
              <div class="w-2 h-2 bg-tertiary rounded-full relative z-10"></div>
            </div>
            <span class="bg-black/40 backdrop-blur-md px-md py-xs rounded-full text-[10px] font-bold text-white uppercase tracking-widest">Online</span>
          </div>

          <div class="absolute top-md right-md" *ngIf="user.isTrending">
            <span class="bg-primary/20 backdrop-blur-md border border-primary/30 px-md py-xs rounded-full text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-xs">
              <span class="material-symbols-outlined text-xs">auto_awesome</span>
              Trending
            </span>
          </div>

          <div class="absolute bottom-0 left-0 right-0 p-lg">
            <div class="flex items-center gap-xs mb-xs">
              <h3 class="font-headline-md text-headline-md text-white truncate">{{ user.name }}, {{ user.age }}</h3>
              <span *ngIf="user.isVerified" class="material-symbols-outlined text-secondary-fixed text-lg" style="font-variation-settings: 'FILL' 1;">verified</span>
              <span *ngIf="user.isPremium" class="material-symbols-outlined text-yellow-400 text-lg" style="font-variation-settings: 'FILL' 1;">workspace_premium</span>
            </div>
            <div class="flex items-center gap-xs text-on-surface-variant font-label-sm text-label-sm mb-md">
              <span class="material-symbols-outlined text-sm">location_on</span>
              {{ user.location }}
            </div>
            <div class="flex flex-wrap gap-xs opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
              <span *ngFor="let interest of user.interests" class="px-md py-xs rounded-full glass-panel border-white/10 text-[10px] text-white">
                {{ interest }}
              </span>
            </div>
            <div class="absolute top-md right-md" *ngIf="user.languages">
              <span class="bg-black/60 backdrop-blur-md px-md py-xs rounded-full text-[10px] font-bold text-white flex items-center gap-xs">
                <span class="material-symbols-outlined text-xs text-secondary-fixed">language</span>
                {{ user.languages }}
              </span>
            </div>
          </div>
        </div>

        <!-- Premium Locked Card -->
        <div class="group relative aspect-[3/4] rounded-2xl overflow-hidden glass-panel flex flex-col items-center justify-center p-xl text-center border-dashed border-2 border-primary/40 bg-primary/5">
          <div class="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-lg">
            <span class="material-symbols-outlined text-primary text-4xl">lock</span>
          </div>
          <h3 class="font-headline-md text-headline-md text-on-surface mb-md">Unlock More</h3>
          <p class="font-label-sm text-label-sm text-on-surface-variant mb-xl leading-relaxed">Upgrade to Premium to see matches filtered by your specific gender preferences.</p>
          <button class="w-full bg-primary text-on-primary font-label-md text-label-md py-md rounded-xl font-bold neon-glow-primary transition-all shadow-[0_0_20px_rgba(216,0,255,0.4)]">Go Premium</button>
        </div>
      </div>

      <!-- Premium Upsell Banner -->
      <section class="mt-xl relative overflow-hidden rounded-3xl p-xl glass-panel border-primary/20">
        <div class="relative z-10 flex flex-col md:flex-row items-center justify-between gap-xl">
          <div class="max-w-2xl">
            <div class="inline-block px-md py-xs rounded-full bg-primary/20 border border-primary/30 mb-lg">
              <span class="text-[10px] font-black uppercase tracking-widest text-primary">Limited Offer</span>
            </div>
            <h2 class="font-headline-lg text-headline-lg text-white mb-md">Pulse Premium Experience</h2>
            <p class="font-body-lg text-body-lg text-on-surface-variant mb-xl">Elevate your connections with advanced targeting and cinematic streaming quality.</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-md mb-xl">
              <div class="flex items-center gap-md">
                <div class="w-10 h-10 rounded-full bg-secondary-fixed/20 flex items-center justify-center">
                  <span class="material-symbols-outlined text-secondary-fixed">wc</span>
                </div>
                <div>
                  <h4 class="font-label-md text-label-md text-white font-bold">Gender Preference</h4>
                  <p class="text-[11px] text-on-surface-variant">Find exactly who you're looking for.</p>
                </div>
              </div>
              <div class="flex items-center gap-md">
                <div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <span class="material-symbols-outlined text-primary">hd</span>
                </div>
                <div>
                  <h4 class="font-label-md text-label-md text-white font-bold">HD Video Quality</h4>
                  <p class="text-[11px] text-on-surface-variant">Crystal clear 1080p discovery.</p>
                </div>
              </div>
              <div class="flex items-center gap-md">
                <div class="w-10 h-10 rounded-full bg-tertiary-fixed/20 flex items-center justify-center">
                  <span class="material-symbols-outlined text-tertiary-fixed">public</span>
                </div>
                <div>
                  <h4 class="font-label-md text-label-md text-white font-bold">Global Travel</h4>
                  <p class="text-[11px] text-on-surface-variant">Match with any country instantly.</p>
                </div>
              </div>
              <div class="flex items-center gap-md">
                <div class="w-10 h-10 rounded-full bg-yellow-400/20 flex items-center justify-center">
                  <span class="material-symbols-outlined text-yellow-400">ad_off</span>
                </div>
                <div>
                  <h4 class="font-label-md text-label-md text-white font-bold">Ad-Free Pulse</h4>
                  <p class="text-[11px] text-on-surface-variant">No interruptions, just discovery.</p>
                </div>
              </div>
            </div>
          </div>
          <div class="w-full md:w-80 p-lg glass-panel bg-white/5 rounded-2xl flex flex-col gap-lg items-center border border-white/10 shadow-2xl">
            <div class="text-center">
              <span class="text-on-surface-variant font-label-sm block mb-xs">Annual Plan</span>
              <div class="flex items-baseline justify-center gap-xs">
                <span class="font-headline-lg text-headline-lg font-black text-white">$9.99</span>
                <span class="text-on-surface-variant font-label-md text-label-md">/mo</span>
              </div>
            </div>
            <ul class="w-full space-y-md">
              <li class="flex items-center gap-md font-label-sm text-label-sm text-on-surface">
                <span class="material-symbols-outlined text-tertiary text-sm">check_circle</span>
                Unlimited Matching
              </li>
              <li class="flex items-center gap-md font-label-sm text-label-sm text-on-surface">
                <span class="material-symbols-outlined text-tertiary text-sm">check_circle</span>
                Premium Badge
              </li>
              <li class="flex items-center gap-md font-label-sm text-label-sm text-on-surface">
                <span class="material-symbols-outlined text-tertiary text-sm">check_circle</span>
                Priority Support
              </li>
            </ul>
            <button class="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline-md text-[16px] py-md rounded-xl neon-glow-primary transition-all active:scale-95">Upgrade Now</button>
            <p class="text-[10px] text-on-surface-variant text-center opacity-60">Cancel anytime. Terms apply.</p>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: []
})
export class DiscoverPageComponent {
  users: DiscoverUser[] = [
    {
      name: 'Aimi', age: 23, location: 'Tokyo, JP',
      avatar: 'https://i.pravatar.cc/400?img=23',
      interests: ['Music Production', 'Travel'],
      isVerified: true, isPremium: false, isOnline: true, isTrending: false, languages: ''
    },
    {
      name: 'Lukas', age: 26, location: 'Stockholm, SE',
      avatar: 'https://i.pravatar.cc/400?img=60',
      interests: ['Fitness', 'Photography'],
      isVerified: false, isPremium: false, isOnline: false, isTrending: true, languages: ''
    },
    {
      name: 'Elena', age: 21, location: 'Rio de Janeiro, BR',
      avatar: 'https://i.pravatar.cc/400?img=25',
      interests: ['Dancing', 'Cooking'],
      isVerified: true, isPremium: false, isOnline: true, isTrending: false, languages: 'PT, EN'
    },
    {
      name: 'Marcus', age: 25, location: 'London, UK',
      avatar: 'https://i.pravatar.cc/400?img=53',
      interests: ['AI', 'E-sports'],
      isVerified: true, isPremium: true, isOnline: false, isTrending: false, languages: ''
    }
  ];

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const ripple = document.createElement('div');
    ripple.className = 'fixed pointer-events-none rounded-full bg-primary/20 w-8 h-8 -translate-x-1/2 -translate-y-1/2 animate-ping z-[100]';
    ripple.style.left = e.clientX + 'px';
    ripple.style.top = e.clientY + 'px';
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }
}
