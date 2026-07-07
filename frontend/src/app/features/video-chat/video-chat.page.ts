import { Component, HostListener, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatchingService, MatchData } from '../../core/services/matching.service';
import { WebRTCService } from '../../core/services/webRTC.service';
import { SocketService } from '../../core/services/socket.service';

@Component({
  selector: 'pulse-video-chat',
  templateUrl: './video-chat.page.html',
  styles: []
})
export class VideoChatPageComponent implements OnInit, OnDestroy {
  @ViewChild('localVideo') localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;

  chatOpen = true;
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
  private subscriptions: Subscription[] = [];

  constructor(
    public matchingService: MatchingService,
    private webRTCService: WebRTCService,
    private socketService: SocketService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.matchingService.status$.subscribe(s => this.status = s)
    );

    this.subscriptions.push(
      this.matchingService.matchFoundObs$.subscribe(async (peer) => {
        this.currentPeer = peer;
        this.currentMatchId = peer.matchId;
        this.chatMessages = [];
        await this.webRTCService.createPeerConnection(peer.matchId);
        await this.webRTCService.createOffer(peer.matchId);
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
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.webRTCService.disconnect();
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
  }

  addFriend(): void {
    if (this.currentPeer) {
      this.socketService.sendFriendRequest(this.currentPeer.userId);
    }
  }

  goBack(): void {
    this.webRTCService.disconnect();
    this.router.navigate(['/dashboard']);
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    this.glowX = (e.clientX / window.innerWidth - 0.5) * 20;
    this.glowY = (e.clientY / window.innerHeight - 0.5) * 20;
  }
}
