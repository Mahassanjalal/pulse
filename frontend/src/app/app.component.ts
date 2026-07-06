import { Component } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  template: `
    <div class="min-h-screen bg-background text-on-surface overflow-x-hidden">
      <!-- Authenticated shell layout -->
      <ng-container *ngIf="showAuthenticatedLayout">
        <pulse-header />
        <div class="flex pt-20">
          <pulse-sidebar />
          <main class="flex-1 md:ml-72 overflow-y-auto min-h-[calc(100vh-80px)]">
            <router-outlet></router-outlet>
          </main>
        </div>
        <pulse-bottom-nav />
      </ng-container>

      <!-- Video chat layout (no sidebar, minimal header) -->
      <ng-container *ngIf="showVideoChatLayout">
        <router-outlet></router-outlet>
      </ng-container>

      <!-- Public layout (no shell) -->
      <ng-container *ngIf="showPublicLayout">
        <router-outlet></router-outlet>
      </ng-container>
    </div>
  `,
  styles: []
})
export class AppComponent {
  showAuthenticatedLayout = false;
  showVideoChatLayout = false;
  showPublicLayout = true;

  private readonly protectedRoutes = [
    '/dashboard', '/messages', '/friends', '/profile',
    '/settings', '/discover', '/premium', '/notifications'
  ];
  private readonly videoRoutes = ['/video'];
  private readonly publicRoutes = ['/', '/login', '/register', '/about'];

  constructor(private router: Router) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.updateLayout(event.urlAfterRedirects || event.url);
    });
  }

  private updateLayout(url: string): void {
    const path = url.split('?')[0].split('#')[0];
    const isVideo = this.videoRoutes.some(r => path.startsWith(r));
    const isProtected = this.protectedRoutes.some(r => path.startsWith(r));
    const isPublic = this.publicRoutes.some(r => path === r || path === r + '/');

    this.showVideoChatLayout = isVideo;
    this.showAuthenticatedLayout = isProtected && !isVideo;
    this.showPublicLayout = !isVideo && !isProtected;
  }
}
