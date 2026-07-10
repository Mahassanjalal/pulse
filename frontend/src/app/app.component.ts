import { Component } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { PremiumModalService } from './core/services/premium-modal.service';
import { SocketService } from './core/services/socket.service';

@Component({
  selector: 'app-root',
  standalone: false,
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

      <!-- Public layout with public header -->
      <ng-container *ngIf="showPublicLayout">
        <pulse-public-header />
        <main class="pt-20">
          <router-outlet></router-outlet>
        </main>
      </ng-container>

      <!-- Premium Modal -->
      <pulse-premium-modal *ngIf="premiumModalOpen$ | async" (closeModal)="closePremiumModal()"></pulse-premium-modal>

      <!-- Incoming call overlay -->
      <div *ngIf="incomingCall" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md px-lg">
        <div class="w-full max-w-sm glass-panel rounded-3xl border border-white/10 p-xl text-center">
          <div class="w-28 h-28 mx-auto rounded-full overflow-hidden border-2 border-secondary/40 mb-lg pulse-animation">
            <img class="w-full h-full object-cover" [src]="incomingCall.caller.profilePicture || 'https://i.pravatar.cc/150?img=5'" [alt]="incomingCall.caller.displayName" />
          </div>
          <h3 class="font-headline text-headline-md text-on-surface mb-xs">Incoming video call</h3>
          <p class="font-body text-body-lg text-on-surface-variant mb-xl">{{ incomingCall.caller.displayName }}</p>
          <div class="flex items-center justify-center gap-xl">
            <button (click)="declineIncomingCall()" type="button" class="w-16 h-16 rounded-full bg-error/20 border border-error/40 text-error flex items-center justify-center hover:bg-error/30 active:scale-95 transition-all">
              <span class="material-symbols-outlined text-3xl">call_end</span>
            </button>
            <button (click)="acceptIncomingCall()" type="button" class="w-16 h-16 rounded-full bg-tertiary/20 border border-tertiary/40 text-tertiary flex items-center justify-center hover:bg-tertiary/30 active:scale-95 transition-all">
              <span class="material-symbols-outlined text-3xl" style="font-variation-settings: 'FILL' 1;">videocam</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Call status toast (caller) -->
      <div *ngIf="callToast" class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-surface/90 backdrop-blur-md border border-white/10 px-lg py-md rounded-xl shadow-2xl">
        <p class="font-label text-label-md text-on-surface">{{ callToast }}</p>
      </div>
    </div>
  `,
  styles: []
})
export class AppComponent {
  showAuthenticatedLayout = false;
  showVideoChatLayout = false;
  showPublicLayout = true;
  premiumModalOpen$ = this.premiumModalService.open$;

  incomingCall: { callId: string; caller: { id: string; displayName: string; profilePicture?: string } } | null = null;
  callToast: string | null = null;
  private callToastTimeout: any = null;
  private callTimeout: any = null;

  private readonly protectedRoutes = [
    '/dashboard', '/messages', '/friends', '/profile',
    '/settings', '/discover', '/notifications'
  ];
  private readonly videoRoutes = ['/video'];
  private readonly publicRoutes = ['/', '/login', '/register', '/about'];

  constructor(
    private router: Router,
    private premiumModalService: PremiumModalService,
    private socketService: SocketService
  ) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.updateLayout(event.urlAfterRedirects || event.url);
    });

    this.socketService.on('incoming_call').subscribe((data: any) => {
      if (this.incomingCall) return;
      this.incomingCall = data;
      this.callTimeout = setTimeout(() => this.declineIncomingCall(), 30000);
    });

    this.socketService.on('call_cancelled').subscribe(() => {
      this.clearIncomingCall();
    });

    this.socketService.on('call_declined').subscribe(() => {
      this.showCallToast('Call declined');
    });

    this.socketService.on('call_error').subscribe((data: any) => {
      this.showCallToast(data?.message || 'Call failed');
    });

    // Ensure the callee lands in the video room when a call is accepted.
    this.socketService.on('match_found').subscribe(() => {
      const path = this.router.url.split('?')[0];
      if (!path.startsWith('/video')) {
        this.router.navigate(['/video']);
      }
    });
  }

  acceptIncomingCall(): void {
    if (!this.incomingCall) return;
    const callId = this.incomingCall.callId;
    this.clearIncomingCall();
    this.socketService.acceptCall(callId);
    this.router.navigate(['/video']);
  }

  declineIncomingCall(): void {
    if (!this.incomingCall) return;
    this.socketService.declineCall(this.incomingCall.callId);
    this.clearIncomingCall();
  }

  private clearIncomingCall(): void {
    this.incomingCall = null;
    if (this.callTimeout) {
      clearTimeout(this.callTimeout);
      this.callTimeout = null;
    }
  }

  private showCallToast(message: string): void {
    this.callToast = message;
    if (this.callToastTimeout) clearTimeout(this.callToastTimeout);
    this.callToastTimeout = setTimeout(() => this.callToast = null, 3000);
  }

  private updateLayout(url: string): void {
    const path = url.split('?')[0].split('#')[0];
    const isVideo = this.videoRoutes.some(r => path.startsWith(r));
    const isProtected = this.protectedRoutes.some(r => path.startsWith(r));
    const isPublic = this.publicRoutes.some(r => path === r || path.startsWith(r + '/'));

    this.showVideoChatLayout = isVideo;
    this.showAuthenticatedLayout = isProtected && !isVideo;
    this.showPublicLayout = !isVideo && !isProtected;
  }

  closePremiumModal(): void {
    this.premiumModalService.close();
  }
}
