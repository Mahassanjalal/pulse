import { Component } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { PremiumModalService } from './core/services/premium-modal.service';
import { SocketService } from './core/services/socket.service';
import { CallService } from './core/services/call.service';
import { CallSoundService } from './core/services/call-sound.service';
import { WebRTCService } from './core/services/webRTC.service';

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
          <main class="flex-1 md:ml-72 overflow-y-auto min-h-[calc(100vh-80px)] pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
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

      <!-- Admin console: full-screen self-contained layout (no marketing chrome) -->
      <ng-container *ngIf="showAdminLayout">
        <router-outlet></router-outlet>
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

      <!-- Outgoing "Calling…" modal (shown while the callee hasn't answered
           yet). Once the callee accepts, the call becomes active and the
           persistent floating widget takes over. -->
      <div *ngIf="isCalling" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md px-lg">
        <div class="w-full max-w-sm glass-panel rounded-3xl border border-white/10 p-xl text-center">
          <div class="w-28 h-28 mx-auto rounded-full overflow-hidden border-2 border-secondary/40 mb-lg pulse-animation">
            <img class="w-full h-full object-cover" [src]="(callService.current?.calleeAvatar || 'https://i.pravatar.cc/150?img=5')" [alt]="callService.current?.calleeName" />
          </div>
          <h3 class="font-headline text-headline-md text-on-surface mb-xs">Calling…</h3>
          <p class="font-body text-body-lg text-on-surface-variant mb-xl">{{ callService.current?.calleeName || 'Friend' }}</p>
          <button (click)="cancelOutgoingCall()" type="button" class="w-16 h-16 mx-auto rounded-full bg-error/20 border border-error/40 text-error flex items-center justify-center hover:bg-error/30 active:scale-95 transition-all">
            <span class="material-symbols-outlined text-3xl">call_end</span>
          </button>
        </div>
      </div>

      <!-- Persistent direct (friend) call widget. Only renders once the call is
           ACTIVE (callee accepted); survives route changes so the user can
           browse the app while on call. -->
      <pulse-friend-call-widget></pulse-friend-call-widget>
    </div>
  `,
  styles: []
})
export class AppComponent {
  showAuthenticatedLayout = false;
  showVideoChatLayout = false;
  showPublicLayout = true;
  showAdminLayout = false;
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
    private socketService: SocketService,
    public callService: CallService,
    private callSoundService: CallSoundService,
    private webRTCService: WebRTCService
  ) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.updateLayout(event.urlAfterRedirects || event.url);
    });

      this.socketService.on('incoming_call').subscribe((data: any) => {
      if (this.incomingCall) return;
      this.incomingCall = data;
      this.callSoundService.startRinging();
      // Auto-decline if the callee ignores the call. Must match (or be slightly
      // below) the backend's pending-call expiry so the panel closes before the
      // server emits call_cancelled for the same call.
      this.callTimeout = setTimeout(() => this.declineIncomingCall(), 11000);
    });

    this.socketService.on('call_cancelled').subscribe(() => {
      this.clearIncomingCall();
    });

    this.socketService.on('call_declined').subscribe(() => {
      this.callService.clear();
      this.showCallToast('Call declined');
    });

    this.socketService.on('call_error').subscribe((data: any) => {
      // Errors for the outgoing call (busy, offline, not friends, timed out)
      // clear the calling overlay; the message always surfaces as a toast.
      this.callService.clear();
      this.showCallToast(data?.message || 'Call failed');
    });

    // The server confirms the call was created and returns the callId. We only
    // fill it in; the "Calling…" modal stays up until the callee accepts.
    this.socketService.on('call_initiated').subscribe((data: any) => {
      this.callService.setCallId(data.callId);
    });

    // When a match is found, only random (non-friend) matches route into the
    // /video room. A direct friend call is owned by the persistent floating
    // widget (driven by CallService): on match_found we promote the call from
    // the "calling" modal to the active widget — we must NOT clear it or
    // navigate, or the widget would vanish for both caller and callee.
    this.socketService.on('match_found').subscribe(() => {
      if (this.callService.current) {
        this.callService.activate();
        return;
      }
      const path = this.router.url.split('?')[0];
      if (!path.startsWith('/video')) {
        this.router.navigate(['/video']);
      }
    });
  }

  get isCalling(): boolean {
    return this.callService.state === 'calling';
  }

  acceptIncomingCall(): void {
    if (!this.incomingCall) return;
    const { callId, caller } = this.incomingCall;
    this.clearIncomingCall();
    this.callSoundService.unlock();
    // Start the persistent widget on the callee side (so it shows + drives
    // WebRTC). We do NOT navigate to /video — the widget floats over whatever
    // page the callee is on and survives navigation.
    this.callService.start({
      callId,
      calleeId: caller.id,
      calleeName: caller.displayName,
      calleeAvatar: caller.profilePicture || '',
    });
    this.socketService.acceptCall(callId);
  }

  declineIncomingCall(): void {
    if (!this.incomingCall) return;
    this.callSoundService.unlock();
    this.socketService.declineCall(this.incomingCall.callId);
    this.clearIncomingCall();
  }

  /** Cancel an outgoing call from the "Calling…" modal. */
  cancelOutgoingCall(): void {
    const call = this.callService.current;
    if (!call) return;
    if (call.callId) {
      this.socketService.cancelCall(call.callId);
    }
    this.callService.clear();
  }

  private clearIncomingCall(): void {
    this.callSoundService.stopRinging();
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
    const isAdmin = path.startsWith('/admin');

    this.showVideoChatLayout = isVideo;
    this.showAuthenticatedLayout = isProtected && !isVideo && !isAdmin;
    this.showPublicLayout = !isVideo && !isProtected && !isAdmin;
    this.showAdminLayout = isAdmin;
  }

  closePremiumModal(): void {
    this.premiumModalService.close();
  }
}
