import { Component } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'pulse-sidebar',
  template: `
    <aside class="hidden md:flex fixed left-0 top-0 h-full flex-col py-6 px-4 bg-surface/80 backdrop-blur-xl w-72 border-r border-white/5 z-50">
      <!-- Brand -->
      <div class="mb-8 px-3">
        <a routerLink="/dashboard" class="font-display text-headline-lg font-black text-primary tracking-tighter">Pulse</a>
        <p class="text-xs text-on-surface-variant/50 mt-0.5 tracking-wider uppercase">Global Discovery</p>
      </div>

      <!-- Navigation -->
      <nav class="flex-grow space-y-1">
        <a *ngFor="let item of navItems"
           [routerLink]="item.route"
           class="sidebar-item"
           [class.active]="isActive(item.route)">
          <span class="material-symbols-outlined text-xl" [class]="isActive(item.route) ? 'text-primary' : ''">{{ item.icon }}</span>
          <span class="font-label text-label-md">{{ item.label }}</span>
          <span *ngIf="item.badge"
            class="ml-auto bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
            {{ item.badge }}
          </span>
        </a>

        <div class="pt-6 mt-6 border-t border-white/5">
          <p class="text-[10px] text-on-surface-variant/40 uppercase tracking-[0.15em] font-semibold px-3 mb-3">Video Chat</p>
          <a routerLink="/video" class="sidebar-item" [class.active]="isActive('/video')">
            <span class="material-symbols-outlined text-xl" [class]="isActive('/video') ? 'text-primary' : ''">videocam</span>
            <span class="font-label text-label-md">Live Chat</span>
          </a>
          <a routerLink="/discover" class="sidebar-item" [class.active]="isActive('/discover')">
            <span class="material-symbols-outlined text-xl" [class]="isActive('/discover') ? 'text-primary' : ''">explore</span>
            <span class="font-label text-label-md">Discover</span>
          </a>
        </div>
      </nav>

      <!-- CTA Button -->
      <div class="mt-auto px-1">
        <a routerLink="/video"
           class="flex items-center justify-center gap-2 w-full py-3.5 bg-gradient-to-r from-primary to-primary-container text-on-primary rounded-2xl font-headline text-label-lg font-bold neon-glow-primary hover:brightness-110 active:scale-[0.97] transition-all shadow-lg shadow-primary/20">
          <span class="material-symbols-outlined text-xl" style="font-variation-settings: 'FILL' 1;">bolt</span>
          Start Matching
        </a>
      </div>
    </aside>
  `,
  styles: [`
    .sidebar-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      color: var(--color-on-surface-variant);
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
      border-radius: 14px;
      position: relative;
    }
    .sidebar-item:hover {
      background: rgba(255, 255, 255, 0.04);
      color: var(--color-on-surface);
    }
    .sidebar-item:active {
      transform: scale(0.98);
    }
    .sidebar-item.active {
      color: var(--color-on-surface);
      background: rgba(247, 172, 255, 0.08);
      font-weight: 600;
    }
    .sidebar-item.active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 24px;
      background: var(--color-primary);
      border-radius: 0 4px 4px 0;
    }
  `]
})
export class SidebarComponent {
  currentUrl = '/dashboard';

  navItems = [
    { icon: 'home', label: 'Home', route: '/dashboard', badge: '' },
    { icon: 'chat_bubble', label: 'Messages', route: '/messages', badge: '' },
    { icon: 'group', label: 'Friends', route: '/friends', badge: '' },
    { icon: 'person', label: 'Profile', route: '/profile', badge: '' },
    { icon: 'notifications', label: 'Notifications', route: '/notifications', badge: '' },
    { icon: 'settings', label: 'Settings', route: '/settings', badge: '' },
  ];

  constructor(private router: Router, private authService: AuthService) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentUrl = event.urlAfterRedirects || event.url;
    });

    const u = this.authService.getCurrentUser();
    if (u && (u.role === 'ADMIN' || u.role === 'MODERATOR')) {
      this.navItems.push({ icon: 'shield', label: 'Admin', route: '/admin', badge: '' });
    }
  }

  isActive(path: string): boolean {
    const cleanPath = this.currentUrl.split('?')[0].split('#')[0];
    if (path === '/dashboard') return cleanPath === '/dashboard';
    return cleanPath.startsWith(path);
  }
}
