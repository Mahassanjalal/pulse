import { Component, HostListener, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { PremiumModalService } from '../../../core/services/premium-modal.service';
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

        <div class="w-px h-6 bg-white/10 mx-2 hidden lg:block"></div>

        <a routerLink="/video"
           class="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl font-label text-label-md font-semibold neon-glow-primary hover:brightness-110 active:scale-[0.97] transition-all">
          <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1">videocam</span>
          <span class="hidden sm:inline">Go Live</span>
        </a>

        <div class="w-px h-6 bg-white/10 mx-2"></div>

        <!-- Avatar Dropdown -->
        <div class="relative ml-1">
          <button (click)="toggleDropdown($event)" class="w-10 h-10 rounded-xl overflow-hidden border-2 transition-all cursor-pointer"
            [ngClass]="dropdownOpen ? 'border-primary' : 'border-white/10 hover:border-primary/40'">
            <img class="w-full h-full object-cover" [src]="userAvatar" alt="Profile" />
          </button>

          <div *ngIf="dropdownOpen"
            class="absolute top-full right-0 mt-2 w-56 glass-panel rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-50"
            (click)="$event.stopPropagation()">
            <a routerLink="/profile" (click)="closeDropdown()"
              class="flex items-center gap-md px-lg py-sm hover:bg-white/5 transition-all">
              <span class="material-symbols-outlined text-lg text-on-surface-variant">person</span>
              <span class="text-sm text-on-surface">Profile</span>
            </a>
            <a routerLink="/notifications" (click)="closeDropdown()"
              class="flex items-center gap-md px-lg py-sm hover:bg-white/5 transition-all relative">
              <span class="material-symbols-outlined text-lg text-on-surface-variant">notifications</span>
              <span class="text-sm text-on-surface">Notifications</span>
              <span *ngIf="unreadCount > 0" class="ml-auto min-w-[18px] h-[18px] bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
            </a>
            <a routerLink="/settings" (click)="closeDropdown()"
              class="flex items-center gap-md px-lg py-sm hover:bg-white/5 transition-all">
              <span class="material-symbols-outlined text-lg text-on-surface-variant">settings</span>
              <span class="text-sm text-on-surface">Settings</span>
            </a>
            <button (click)="openPremiumModal(); closeDropdown()"
              class="w-full flex items-center gap-md px-lg py-sm hover:bg-white/5 transition-all">
              <span class="material-symbols-outlined text-lg text-yellow-400">workspace_premium</span>
              <span class="text-sm text-on-surface">Premium</span>
            </button>
            <div class="h-px bg-white/5 mx-lg"></div>
            <button (click)="logout()"
              class="w-full flex items-center gap-md px-lg py-sm hover:bg-error/10 transition-all group">
              <span class="material-symbols-outlined text-lg text-error">logout</span>
              <span class="text-sm text-error">Logout</span>
            </button>
          </div>
        </div>
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
  unreadCount = 0;
  dropdownOpen = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    private notificationService: NotificationService,
    private premiumModalService: PremiumModalService
  ) {
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
    this.notificationService.notifications$.subscribe(() => {
      this.unreadCount = this.notificationService.getUnreadCount();
    });
    this.notificationService.unreadCount$.subscribe(count => {
      this.unreadCount = count;
    });
    this.notificationService.loadNotifications();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled = window.scrollY > 30;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.dropdownOpen = false;
  }

  isActive(path: string): boolean {
    const cleanPath = this.currentUrl.split('?')[0].split('#')[0];
    return cleanPath.startsWith(path);
  }

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;
  }

  closeDropdown(): void {
    this.dropdownOpen = false;
  }

  openPremiumModal(): void {
    this.premiumModalService.open();
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
