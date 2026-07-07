import { Component, HostListener, Input } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'pulse-public-header',
  template: `
    <header class="fixed top-0 right-0 left-0 z-50 flex items-center justify-between px-lg md:px-xl backdrop-blur-xl w-full border-b transition-all duration-300"
      [ngClass]="scrolled ? 'h-16 bg-surface/95 border-white/5 shadow-lg shadow-black/10' : 'h-20 bg-surface/40 border-white/5'">
      <!-- Left: Brand + Nav -->
      <div class="flex items-center gap-xl">
        <a routerLink="/" class="flex items-center gap-sm group">
          <span class="font-display text-display-md font-black text-primary tracking-tighter transition-all group-hover:drop-shadow-[0_0_12px_rgba(247,172,255,0.6)]">Pulse</span>
        </a>
        <nav class="hidden md:flex items-center gap-1">
          <a routerLink="/"
             class="nav-link"
             [class.active]="isActive('/')">
            <span class="material-symbols-outlined text-lg">home</span>
            Home
          </a>
          <a routerLink="/discover"
             class="nav-link"
             [class.active]="isActive('/discover')">
            <span class="material-symbols-outlined text-lg">explore</span>
            Discover
          </a>
          <a routerLink="/premium"
             class="nav-link"
             [class.active]="isActive('/premium')">
            <span class="material-symbols-outlined text-lg">workspace_premium</span>
            Premium
          </a>
          <a routerLink="/about"
             class="nav-link"
             [class.active]="isActive('/about')">
            <span class="material-symbols-outlined text-lg">info</span>
            About
          </a>
        </nav>
      </div>

      <!-- Right: Actions -->
      <div class="flex items-center gap-sm">
        <a routerLink="/login"
           class="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all font-label text-label-md cursor-pointer">
          Sign In
        </a>
        <a routerLink="/register"
           class="flex items-center gap-1.5 px-5 py-2.5 bg-primary text-on-primary rounded-xl font-label text-label-md font-semibold neon-glow-primary hover:brightness-110 active:scale-[0.97] transition-all">
          <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1">bolt</span>
          Get Started
        </a>
      </div>
    </header>
  `,
  styles: [`
    .nav-link {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      color: var(--color-on-surface-variant);
      text-decoration: none;
      transition: all 0.2s ease;
      position: relative;
    }
    .nav-link:hover {
      color: var(--color-on-surface);
      background: rgba(255, 255, 255, 0.04);
    }
    .nav-link.active {
      color: var(--color-primary);
      background: rgba(247, 172, 255, 0.08);
    }
    .nav-link.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 50%;
      transform: translateX(-50%);
      width: 20px;
      height: 2px;
      background: var(--color-primary);
      border-radius: 1px;
    }
  `]
})
export class PublicHeaderComponent {
  scrolled = false;
  currentUrl = '/';

  constructor(private router: Router) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentUrl = event.urlAfterRedirects || event.url;
    });
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled = window.scrollY > 30;
  }

  isActive(path: string): boolean {
    const cleanPath = this.currentUrl.split('?')[0].split('#')[0];
    if (path === '/') return cleanPath === '/';
    return cleanPath.startsWith(path);
  }
}
