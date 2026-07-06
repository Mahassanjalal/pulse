import { Component, HostListener } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'pulse-header',
  template: `
    <header class="fixed top-0 right-0 left-0 z-50 flex items-center justify-between px-lg md:px-xl backdrop-blur-lg w-full border-b border-white/10 transition-all duration-300"
      [ngClass]="scrolled ? 'h-14 bg-surface/95' : 'h-20 bg-surface/60'">
      <div class="flex items-center gap-md">
        <pulse-sidebar-toggle />
        <a routerLink="/dashboard" class="font-display-lg text-display-lg font-black text-primary tracking-tighter cursor-pointer">Pulse</a>
      </div>
      <div class="hidden md:flex items-center flex-grow max-w-2xl px-lg">
        <div class="w-full relative">
          <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            class="w-full bg-surface-container/40 border border-white/5 rounded-full py-2.5 pl-12 pr-4 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-secondary transition-all"
            placeholder="Search global pulse..."
            type="text"
          />
        </div>
      </div>
      <div class="flex items-center gap-lg">
        <div class="hidden lg:flex items-center gap-md">
          <a routerLink="/discover" class="font-label-md text-label-md text-on-surface-variant hover:text-primary transition-all">Discover</a>
          <a routerLink="/premium" class="font-label-md text-label-md text-on-surface-variant hover:text-primary transition-all">Premium</a>
        </div>
        <button class="bg-primary px-lg py-sm rounded-full text-on-primary font-bold hover:opacity-90 active:scale-95 transition-all">Go Live</button>
        <div class="flex items-center gap-sm">
          <span class="material-symbols-outlined text-on-surface-variant hover:text-on-surface cursor-pointer">settings</span>
          <div class="w-10 h-10 rounded-full border-2 border-primary overflow-hidden cursor-pointer">
            <img class="w-full h-full object-cover" src="https://i.pravatar.cc/100?img=1" alt="Profile" />
          </div>
        </div>
      </div>
    </header>
  `,
  styles: []
})
export class HeaderComponent {
  scrolled = false;

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled = window.scrollY > 50;
  }
}
