import { Component, HostListener, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'pulse-header',
  template: `
    <header class="fixed top-0 right-0 left-0 z-50 flex items-center justify-between px-lg md:px-xl backdrop-blur-xl w-full border-b transition-all duration-300"
      [ngClass]="scrolled ? 'h-16 bg-surface/95 border-white/5 shadow-lg shadow-black/10' : 'h-20 bg-surface/40 border-white/5'">
      <!-- Left: Toggle + Brand -->
      <div class="flex items-center gap-md">
        <pulse-sidebar-toggle />
        <a routerLink="/dashboard" class="flex items-center gap-sm group">
          <span class="font-display text-display-md font-black text-primary tracking-tighter transition-all group-hover:drop-shadow-[0_0_12px_rgba(247,172,255,0.6)]">Pulse</span>
        </a>
      </div>

      <!-- Center: Search -->
      <div class="hidden md:flex items-center flex-grow max-w-xl px-lg">
        <div class="w-full relative group">
          <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">search</span>
          <input
            class="w-full bg-surface-container/60 border border-white/5 rounded-2xl py-2.5 pl-12 pr-4 text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/40 focus:bg-surface-container transition-all text-sm"
            placeholder="Search people, conversations..."
            type="text"
          />
        </div>
      </div>

      <!-- Right: Actions -->
      <div class="flex items-center gap-1">
        <a routerLink="/discover"
           class="nav-pill hidden lg:flex"
           [class.active]="isActive('/discover')">
          <span class="material-symbols-outlined text-lg">explore</span>
          <span>Discover</span>
        </a>
        <a routerLink="/premium"
           class="nav-pill hidden lg:flex"
           [class.active]="isActive('/premium')">
          <span class="material-symbols-outlined text-lg">workspace_premium</span>
          <span>Premium</span>
        </a>

        <div class="w-px h-6 bg-white/10 mx-2 hidden lg:block"></div>

        <a routerLink="/video"
           class="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl font-label text-label-md font-semibold neon-glow-primary hover:brightness-110 active:scale-[0.97] transition-all">
          <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1">videocam</span>
          <span class="hidden sm:inline">Go Live</span>
        </a>

        <div class="w-px h-6 bg-white/10 mx-2"></div>

        <a routerLink="/settings"
           class="w-10 h-10 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-all"
           [class.text-primary]="isActive('/settings')">
          <span class="material-symbols-outlined">settings</span>
        </a>

        <a routerLink="/profile"
           class="w-10 h-10 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ml-1"
           [ngClass]="isActive('/profile') ? 'border-primary' : 'border-white/10'">
          <img class="w-full h-full object-cover" [src]="userAvatar" alt="Profile" />
        </a>
      </div>
    </header>
  `,
  styles: [`
    .nav-pill {
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
      cursor: pointer;
    }
    .nav-pill:hover {
      color: var(--color-on-surface);
      background: rgba(255, 255, 255, 0.04);
    }
    .nav-pill.active {
      color: var(--color-primary);
      background: rgba(247, 172, 255, 0.08);
    }
  `]
})
export class HeaderComponent implements OnInit {
  scrolled = false;
  currentUrl = '/dashboard';
  userAvatar = 'https://i.pravatar.cc/100?img=1';

  constructor(private router: Router, private authService: AuthService) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentUrl = event.urlAfterRedirects || event.url;
    });
  }

  ngOnInit(): void {
    this.authService.user$.subscribe(user => {
      if (user?.profilePicture) {
        this.userAvatar = user.profilePicture;
      }
    });
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled = window.scrollY > 30;
  }

  isActive(path: string): boolean {
    const cleanPath = this.currentUrl.split('?')[0].split('#')[0];
    return cleanPath.startsWith(path);
  }
}
