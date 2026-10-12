import { Component, HostListener, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatchingService, MatchData } from '../../core/services/matching.service';
import { WebRTCService } from '../../core/services/webRTC.service';
import { SocketService } from '../../core/services/socket.service';
import { CallService } from '../../core/services/call.service';
import { ReportService, ReportCategory, REPORT_CATEGORIES } from '../../core/services/report.service';

@Component({
  selector: 'pulse-video-chat',
  templateUrl: './video-chat.page.html',
  styles: []
})
export class VideoChatPageComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('localVideo') localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('chatMessagesContainer') chatMessagesContainer!: ElementRef<HTMLElement>;
  @ViewChild('mobileChatMessagesContainer') mobileChatMessagesContainer!: ElementRef<HTMLElement>;

  chatOpen = true;
  mobileChatOpen = false;
  isMuted = false;
  isCameraOff = false;
  newChatMessage = '';
  matchTime = '00:00';
  glowX = 0;
  glowY = 0;
  status = 'idle';
  currentPeer: MatchData | null = null;
  currentMatchId: string | null = null;
  chatMessages: { text: string; self: boolean; time: string }[] = [];
  toastMessage: string | null = null;
  connectionState = '';
  // Safety UI (C7): report modal + block flow available mid-call.
  reportOpen = false;
  reportCategory: ReportCategory = 'NUDITY';
  reportDetails = '';
  reportCategories = REPORT_CATEGORIES;
  submittingReport = false;
  private blockingPeer = false;
  connectionStateColor = '';
  hadPreviousMatch = false;
  private toastTimeout: any = null;
  private subscriptions: Subscription[] = [];

  /** True when the live match is a direct friend call (CallService active).
   *  Direct calls are owned by the floating widget, so the /video room must
   *  not expose Next/Skip — those would wrongly drop a friend call. */
  get isDirectCall(): boolean {
    return !!this.callService.current;
  }

  constructor(
    public matchingService: MatchingService,
    private webRTCService: WebRTCService,
    private socketService: SocketService,
    private router: Router,
    private callService: CallService,
    private reportService: ReportService
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.matchingService.status$.subscribe(s => this.status = s)
    );

    this.subscriptions.push(
      this.matchingService.matchFoundObs$.subscribe(async (peer) => {
        // H14: direct friend calls also emit `match_found`, but they are owned
        // by the floating FriendCallWidget. Reacting here as well created a
        // SECOND peer connection that replaced the widget's (breaking the
        // call). Bail out when a direct call is live, and ignore duplicate
        // events for the match we're already handling.
        if (this.callService.current) return;
        if (this.currentMatchId === peer.matchId) return;
        this.currentPeer = peer;
        this.currentMatchId = peer.matchId;
        this.hadPreviousMatch = true;
        this.chatMessages = [];
        this.chatOpen = true;
        this.mobileChatOpen = false;
        await this.webRTCService.init();
        this.isMuted = false;
        this.isCameraOff = false;
        await this.webRTCService.createPeerConnection(peer.matchId);
        if (peer.isInitiator) {
          await this.webRTCService.createOffer(peer.matchId);
        }
      })
    );

    this.subscriptions.push(
      this.matchingService.timer$.subscribe(seconds => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        this.matchTime = `${mins}:${secs}`;
      })
    );

    this.subscriptions.push(
      this.matchingService.matchEndedObs$.subscribe(() => {
        this.currentPeer = null;
        this.currentMatchId = null;
        this.webRTCService.disconnect();
      })
    );

    this.subscriptions.push(
      this.matchingService.matchSkippedObs$.subscribe(() => {
        this.currentPeer = null;
        this.currentMatchId = null;
        this.webRTCService.disconnect();
      })
    );

    this.subscriptions.push(
      this.socketService.on('match_message').subscribe((msg: any) => {
        this.chatMessages.push({
          text: msg.content,
          self: false,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        this.scrollChatToBottom();
      })
    );

    this.subscriptions.push(
      this.webRTCService.localStream$.subscribe(stream => {
        if (stream && this.localVideoRef?.nativeElement) {
          this.localVideoRef.nativeElement.srcObject = stream;
        }
      })
    );

    this.subscriptions.push(
      this.webRTCService.remoteStream$.subscribe(stream => {
        if (stream && this.remoteVideoRef?.nativeElement) {
          this.remoteVideoRef.nativeElement.srcObject = stream;
        }
      })
    );

    this.subscriptions.push(
      this.socketService.on('error').subscribe((data: any) => {
        this.showToast(data.message || 'An error occurred');
      })
    );

    this.subscriptions.push(
      this.webRTCService.connectionState$.subscribe(state => {
        this.connectionState = state;
        const colorMap: Record<string, string> = {
          connected: 'bg-tertiary',
          connecting: 'bg-yellow-400',
          disconnected: 'bg-error',
          failed: 'bg-error',
          closed: 'bg-on-surface-variant',
          'new': 'bg-on-surface-variant',
        };
        this.connectionStateColor = colorMap[state] || 'bg-on-surface-variant';
      })
    );
  }

  ngAfterViewInit(): void {
    const currentLocal = this.webRTCService.getLocalStream();
    if (currentLocal && this.localVideoRef?.nativeElement) {
      this.localVideoRef.nativeElement.srcObject = currentLocal;
    }
    const currentRemote = this.webRTCService.getRemoteStream();
    if (currentRemote && this.remoteVideoRef?.nativeElement) {
      this.remoteVideoRef.nativeElement.srcObject = currentRemote;
    }
  }

  private scrollChatToBottom(): void {
    setTimeout(() => {
      if (this.chatMessagesContainer?.nativeElement) {
        this.chatMessagesContainer.nativeElement.scrollTop = this.chatMessagesContainer.nativeElement.scrollHeight;
      }
      if (this.mobileChatMessagesContainer?.nativeElement) {
        this.mobileChatMessagesContainer.nativeElement.scrollTop = this.mobileChatMessagesContainer.nativeElement.scrollHeight;
      }
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    // H14: WebRTCService is a singleton shared with the friend-call widget.
    // Tearing it down here used to kill an active friend call whenever the
    // user navigated away from /video. Only release media for random matches.
    if (!this.callService.current) {
      this.webRTCService.disconnect();
    }
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  startMatching(): void {
    this.matchingService.startMatching();
  }

  skipMatch(): void {
    this.matchingService.skipMatch();
  }

  endMatch(): void {
    this.matchingService.endMatch();
  }

  toggleMute(): void {
    this.isMuted = !this.isMuted;
    this.webRTCService.toggleMicrophone();
  }

  toggleCamera(): void {
    this.isCameraOff = !this.isCameraOff;
    this.webRTCService.toggleCamera();
  }

  toggleChat(): void {
    if (window.innerWidth < 768) {
      this.mobileChatOpen = !this.mobileChatOpen;
    } else {
      this.chatOpen = !this.chatOpen;
    }
  }

  sendChatMessage(): void {
    if (!this.newChatMessage.trim() || !this.currentMatchId) return;
    const content = this.newChatMessage.trim();
    this.newChatMessage = '';
    this.socketService.sendMatchMessage(this.currentMatchId, content);
    this.chatMessages.push({
      text: content,
      self: true,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    this.scrollChatToBottom();
  }

  addFriend(): void {
    if (this.currentPeer) {
      this.socketService.sendFriendRequest(this.currentPeer.userId);
      this.showToast('Friend request sent!');
    }
  }

  // ---------------- Safety: report & block (C7) ----------------

  openReport(): void {
    if (!this.currentPeer) return;
    this.reportCategory = 'NUDITY';
    this.reportDetails = '';
    this.reportOpen = true;
  }

  closeReport(): void {
    this.reportOpen = false;
  }

  async submitReport(): Promise<void> {
    if (!this.currentPeer || this.submittingReport) return;
    this.submittingReport = true;
    try {
      const details = this.reportDetails.trim() ||
        `Reported for ${this.reportCategory} during a video call.`;
      await this.reportService.report(this.currentPeer.userId, this.reportCategory, details);
      this.reportOpen = false;
      this.showToast('Report submitted. Thank you for keeping Pulse safe.');
      // Leave the call immediately after reporting — the user asked out.
      this.leaveAfterSafetyAction();
    } catch {
      this.showToast('Could not submit report. Please try again.');
    } finally {
      this.submittingReport = false;
    }
  }

  async blockPeer(): Promise<void> {
    if (!this.currentPeer || this.blockingPeer) return;
    this.blockingPeer = true;
    try {
      await this.reportService.block(this.currentPeer.userId);
      this.showToast('User blocked.');
      // Blocking also excludes them from future matches (server-side) and
      // ends the current call.
      this.leaveAfterSafetyAction();
    } catch {
      this.showToast('Could not block user. Please try again.');
    } finally {
      this.blockingPeer = false;
    }
  }

  private leaveAfterSafetyAction(): void {
    this.reportOpen = false;
    const wasDirect = !!this.callService.current;
    if (wasDirect) {
      // Hand the hang-up to the widget's call flow.
      this.callService.clear();
    } else if (this.currentMatchId) {
      this.matchingService.skipMatch();
    }
    this.currentPeer = null;
    this.currentMatchId = null;
    this.webRTCService.disconnect();
  }

  goBack(): void {
    this.webRTCService.disconnect();
    this.router.navigate(['/dashboard']);
  }

  showToast(message: string): void {
    this.toastMessage = message;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toastMessage = null, 3000);
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    this.glowX = (e.clientX / window.innerWidth - 0.5) * 20;
    this.glowY = (e.clientY / window.innerHeight - 0.5) * 20;
  }
}
