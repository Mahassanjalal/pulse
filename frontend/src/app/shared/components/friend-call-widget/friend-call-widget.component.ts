import { Component, ElementRef, HostListener, OnDestroy, ViewChild, ViewEncapsulation } from '@angular/core';
import { Subscription } from 'rxjs';
import { CallService, OutgoingCall } from '../../../core/services/call.service';
import { WebRTCService } from '../../../core/services/webRTC.service';
import { SocketService } from '../../../core/services/socket.service';

/**
 * Persistent floating widget for direct (friend-to-friend) video calls.
 * Lives at the AppComponent level so it survives route changes — the user can
 * navigate anywhere in the app while staying on the call. It is draggable via
 * the header and minimizable to a small pill. Only video + audio controls are
 * exposed; chat is intentionally excluded for direct calls.
 */
@Component({
  selector: 'pulse-friend-call-widget',
  templateUrl: './friend-call-widget.component.html',
  styleUrls: ['./friend-call-widget.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class FriendCallWidgetComponent implements OnDestroy {
  @ViewChild('localVideo') localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('panel') panelRef!: ElementRef<HTMLDivElement>;

  active: OutgoingCall | null = null;
  callStage: 'connecting' | 'live' = 'connecting';
  private currentMatchId: string | null = null;
  minimized = false;
  isMuted = false;
  isCameraOff = false;
  callTimer = '00:00';
  connectionState = '';
  cameraError: string | null = null;

  // Drag state (pointer events so it works for touch + mouse).
  isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private posX = 24;
  private posY = 24;

  private subs: Subscription[] = [];
  private timerInterval: any = null;
  private elapsed = 0;

  constructor(
    public callService: CallService,
    private webRTCService: WebRTCService,
    private socketService: SocketService,
  ) {
    // The widget only renders once the call is ACTIVE (callee accepted and the
    // WebRTC match is live). While state is 'calling' the AppComponent shows
    // the centered "Calling…" modal instead. Any non-active state (calling,
    // or idle after cancel/decline/error/end) must release the camera + mic so
    // the device isn't left streaming. Re-acquiring on 'active' works without
    // a fresh gesture because permission was already granted by the click.
    this.subs.push(
      this.callService.state$.subscribe(state => {
        if (state === 'active') {
          this.active = this.callService.current;
          this.minimized = false;
          this.callStage = 'connecting';
          this.elapsed = 0;
          this.startTimer();
        } else {
          this.active = null;
          this.stopTimer();
          this.currentMatchId = null;
          // Release camera + mic on ringing / cancel / decline / error / end.
          this.webRTCService.disconnect();
        }
      })
    );

    this.subs.push(
      this.webRTCService.localStream$.subscribe(stream => {
        if (stream && this.localVideoRef?.nativeElement) {
          this.localVideoRef.nativeElement.srcObject = stream;
        }
      })
    );

    this.subs.push(
      this.webRTCService.remoteStream$.subscribe(stream => {
        if (stream && this.remoteVideoRef?.nativeElement) {
          this.remoteVideoRef.nativeElement.srcObject = stream;
          if (stream.getTracks().length > 0 && this.callStage !== 'live') {
            this.callStage = 'live';
          }
        }
      })
    );

    this.subs.push(
      this.webRTCService.connectionState$.subscribe(state => {
        this.connectionState = state;
        if (state === 'connected') this.callStage = 'live';
      })
    );

    // If camera/mic can't be acquired (e.g. insecure LAN origin on
    // mobile, or permission denied) show why instead of hanging on
    // "Connecting…", and tear the call down so the camera LED is freed.
    this.subs.push(
      this.webRTCService.cameraError$.subscribe(err => {
        if (!err) { this.cameraError = null; return; }
        this.cameraError = err;
        this.callStage = 'connecting';
        const call = this.callService.current;
        if (call?.callId) this.socketService.cancelCall(call.callId);
        this.callService.clear();
      })
    );

    // The direct call's WebRTC connection is owned by this widget (not the
    // /video page) so the call stays alive while the user navigates the app.
    // Only acts when there is an active friend call (callService.current).
    this.subs.push(
      this.socketService.on('match_found').subscribe(async (data: any) => {
        if (!this.callService.current) return; // random match -> /video handles it
        if (this.currentMatchId === data.matchId) return;
        this.currentMatchId = data.matchId;
        this.callStage = 'connecting';
        try {
          await this.webRTCService.init();
          await this.webRTCService.createPeerConnection(data.matchId);
          if (data.isInitiator) {
            await this.webRTCService.createOffer(data.matchId);
          }
        } catch (e) {
          console.error('Friend call WebRTC setup failed', e);
        }
      })
    );

    // If the server tears the call down, clear it from the widget too.
    this.subs.push(
      this.socketService.on('call_cancelled').subscribe(() => this.callService.clear())
    );
    this.subs.push(
      this.socketService.on('call_declined').subscribe(() => this.callService.clear())
    );
    this.subs.push(
      this.socketService.on('call_error').subscribe(() => this.callService.clear())
    );
    this.subs.push(
      this.socketService.on('match_ended').subscribe(() => this.callService.clear())
    );
  }

  // ---- Drag handling ----
  onDragStart(event: PointerEvent): void {
    if (this.minimized) return;
    this.isDragging = true;
    const panel = this.panelRef.nativeElement;
    const rect = panel.getBoundingClientRect();
    this.posX = rect.left;
    this.posY = rect.top;
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  @HostListener('document:pointermove', ['$event'])
  onDragMove(event: PointerEvent): void {
    if (!this.isDragging) return;
    event.preventDefault();
    this.posX = event.clientX - this.dragOffsetX;
    this.posY = event.clientY - this.dragOffsetY;
    this.clampPosition();
  }

  @HostListener('document:pointerup')
  onDragEnd(): void {
    this.isDragging = false;
  }

  private clampPosition(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const panelW = this.panelRef?.nativeElement?.offsetWidth || 320;
    const panelH = this.panelRef?.nativeElement?.offsetHeight || 240;
    this.posX = Math.max(8, Math.min(this.posX, w - panelW - 8));
    this.posY = Math.max(8, Math.min(this.posY, h - panelH - 8));
  }

  get panelStyle(): Record<string, string> {
    return {
      left: `${this.posX}px`,
      top: `${this.posY}px`,
    };
  }

  // ---- Controls ----
  toggleMute(): void {
    this.isMuted = !this.isMuted;
    this.webRTCService.toggleMicrophone();
  }

  toggleCamera(): void {
    this.isCameraOff = !this.isCameraOff;
    this.webRTCService.toggleCamera();
  }

  hangUp(): void {
    const call = this.callService.current;
    // End an active direct call (clears the leaked activeMatches entry on the
    // server so the next call doesn't fail with "already in a call"), and also
    // cancel any still-pending call for the rare race where hang-up fires
    // before the peer accepts.
    if (this.currentMatchId) {
      this.socketService.endDirectCall(this.currentMatchId);
    }
    if (call?.callId) {
      this.socketService.cancelCall(call.callId);
    }
    this.webRTCService.disconnect();
    this.currentMatchId = null;
    this.callService.clear();
  }

  toggleMinimize(): void {
    this.minimized = !this.minimized;
    if (!this.minimized) {
      // Re-clamp once expanded so it stays on-screen.
      setTimeout(() => this.clampPosition(), 0);
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.callTimer = '00:00';
    this.timerInterval = setInterval(() => {
      this.elapsed++;
      const m = Math.floor(this.elapsed / 60).toString().padStart(2, '0');
      const s = (this.elapsed % 60).toString().padStart(2, '0');
      this.callTimer = `${m}:${s}`;
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.stopTimer();
    this.webRTCService.disconnect();
  }

  // Bind the current streams once the view (and thus the @ViewChild refs)
  // exists. Without this, the first localStream/remoteStream emissions from
  // init()/createPeerConnection can arrive before the *ngIf-rendered video
  // elements are resolved, leaving the local preview permanently black.
  ngAfterViewInit(): void {
    const local = this.webRTCService.getLocalStream();
    const remote = this.webRTCService.getRemoteStream();
    if (local && this.localVideoRef?.nativeElement) {
      this.localVideoRef.nativeElement.srcObject = local;
    }
    if (remote && this.remoteVideoRef?.nativeElement) {
      this.remoteVideoRef.nativeElement.srcObject = remote;
    }
  }
}
