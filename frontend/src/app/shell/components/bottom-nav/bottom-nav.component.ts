import { Component } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'pulse-bottom-nav',
  template: `
    <nav class="md:hidden fixed bottom-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-bottom))] bg-surface/90 backdrop-blur-xl flex items-center justify-around px-2 z-50 border-t border-white/5 pb-[env(safe-area-inset-bottom)]">
      <a *ngFor="let item of navItems"
         [routerLink]="item.route"
         class="bottom-nav-item"
         [class.active]="isActive(item.route)">
        <div class="relative">
          <span class="material-symbols-outlined text-[22px]" [class]="isActive(item.route) ? 'text-primary' : ''">{{ item.icon }}</span>
          <span *ngIf="item.badge && unreadCount > 0" class="absolute -top-1 -right-2 min-w-[16px] h-[16px] bg-error text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 border border-surface">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
        </div>
        <span class="text-[10px] mt-0.5">{{ item.label }}</span>
      </a>
      <a routerLink="/video" class="flex flex-col items-center -mt-5">
        <div class="w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/40 text-on-primary active:scale-90 transition-transform">
          <span class="material-symbols-outlined text-2xl" style="font-variation-settings: 'FILL' 1;">add</span>
        </div>
      </a>
    </nav>
  `,
  styles: [`
    .bottom-nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 6px 0;
      color: var(--color-on-surface-variant);
      text-decoration: none;
      transition: all 0.2s ease;
      min-width: 48px;
    }
    .bottom-nav-item.active {
      color: var(--color-primary);
    }
  `]
})
export class BottomNavComponent {
  currentUrl = '/dashboard';
  unreadCount = 0;

  navItems = [
    { icon: 'home', label: 'Home', route: '/dashboard', badge: false },
    { icon: 'explore', label: 'Explore', route: '/discover', badge: false },
    { icon: 'chat', label: 'Messages', route: '/messages', badge: false },
    { icon: 'notifications', label: 'Alerts', route: '/notifications', badge: true },
    { icon: 'person', label: 'Profile', route: '/profile', badge: false },
  ];

  constructor(
    private router: Router,
    private notificationService: NotificationService,
    private authService: AuthService
  ) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentUrl = event.urlAfterRedirects || event.url;
    });
    this.notificationService.unreadCount$.subscribe(count => {
      this.unreadCount = count;
    });
    this.notificationService.loadNotifications();

    const u = this.authService.getCurrentUser();
    if (u && (u.role === 'ADMIN' || u.role === 'MODERATOR')) {
      this.navItems.push({ icon: 'shield', label: 'Admin', route: '/admin', badge: false });
    }
  }

  isActive(path: string): boolean {
    const cleanPath = this.currentUrl.split('?')[0].split('#')[0];
    if (path === '/dashboard') return cleanPath === '/dashboard';
    return cleanPath.startsWith(path);
  }
}
