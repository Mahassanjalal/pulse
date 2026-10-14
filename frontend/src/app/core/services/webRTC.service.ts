import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { SocketService } from './socket.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentMatchId: string | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private pendingOffer: { offer: any } | null = null;

  private localStreamSubject = new BehaviorSubject<MediaStream | null>(null);
  private remoteStreamSubject = new BehaviorSubject<MediaStream | null>(null);
  private connectionStateSubject = new Subject<string>();
  private cameraErrorSubject = new Subject<string | null>();

  // Phase 4: one final call-quality report per call (ICE outcome, transport,
  // RTT, duration) sent to the backend's `call_stats` event → Prometheus.
  private statsMatchId: string | null = null;
  private callConnectedAt: number | null = null;
  private statsReported = false;
  private statsTimer: ReturnType<typeof setTimeout> | null = null;
  // P4b: tiered media quality follows the caller's premium state.
  private isPremium = false;

  // M9: TURN/STUN servers are resolved per call. The static list below is a
  // dev fallback only; in production the backend mints SHORT-LIVED HMAC
  // credentials for our own coturn fleet via /webrtc/turn-credentials
  // (previously the app shipped a hardcoded public relay credential).
  private staticIceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    ...(environment.turnServers ?? []),
  ];
  private cachedIce: RTCConfiguration | null = null;
  private iceFetchedAt = 0;

  private get iceServers(): RTCConfiguration {
    return this.cachedIce ?? { iceServers: this.staticIceServers };
  }

  /**
   * Fetch TURN credentials from the backend (cached for their TTL, refreshed
   * a minute early). Falls back to the static/dev list on any failure so
   * calls still work, just with lower connectivity success behind strict NATs.
   */
  private async ensureIceServers(): Promise<RTCConfiguration> {
    const now = Date.now();
    if (this.cachedIce && now < this.iceFetchedAt) return this.cachedIce;
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('no token');
      const res = await fetch(`${environment.apiUrl}/webrtc/turn-credentials`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.configured && Array.isArray(data.iceServers) && data.iceServers.length) {
        const ttlMs = Math.max((data.ttl || 3600) * 1000 - 60_000, 60_000);
        this.cachedIce = { iceServers: data.iceServers };
        this.iceFetchedAt = now + ttlMs;
        return this.cachedIce;
      }
      // Backend has no TURN configured (dev) — use the static list.
      this.cachedIce = { iceServers: this.staticIceServers };
      this.iceFetchedAt = now + 5 * 60_000;
      return this.cachedIce;
    } catch {
      this.cachedIce = { iceServers: this.staticIceServers };
      this.iceFetchedAt = now + 60_000;
      return this.cachedIce;
    }
  }

  constructor(private socketService: SocketService, auth: AuthService) {
    auth.user$.subscribe((u) => {
      this.isPremium = !!u?.isPremium;
    });

    this.socketService.on('webrtc_offer').subscribe(async (data: any) => {
      if (!this.peerConnection) {
        // The answerer may still be initializing getUserMedia / creating the
        // peer connection. Buffer the offer and apply it once createPeerConnection
        // runs, otherwise the offer is dropped and the connection never forms.
        this.pendingOffer = { offer: data.offer };
        return;
      }
      await this.handleOffer(data.offer);
    });

    this.socketService.on('webrtc_answer').subscribe(async (data: any) => {
      if (!this.peerConnection) return;
      try {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        await this.flushCandidates();
      } catch (e) {
        console.error('Error handling webrtc answer', e);
      }
    });

    this.socketService.on('webrtc_candidate').subscribe(async (data: any) => {
      if (!this.peerConnection || !data.candidate) return;
      try {
        // Buffer candidates that arrive before the remote description is set,
        // otherwise addIceCandidate throws and the candidate is lost.
        if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          this.pendingCandidates.push(data.candidate);
        }
      } catch (e) {
        console.error('Error adding ice candidate', e);
      }
    });
  }

  private async handleOffer(offer: any): Promise<void> {
    try {
      if (!this.peerConnection) return;
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      if (this.currentMatchId) {
        this.socketService.sendAnswer(this.currentMatchId, answer);
      }
      await this.flushCandidates();
    } catch (e) {
      console.error('Error handling webrtc offer', e);
    }
  }

  private async flushCandidates(): Promise<void> {
    if (!this.peerConnection) return;
    while (this.pendingCandidates.length) {
      const candidate = this.pendingCandidates.shift()!;
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding buffered ice candidate', e);
      }
    }
  }

  get localStream$(): Observable<MediaStream | null> {
    return this.localStreamSubject.asObservable();
  }

  get remoteStream$(): Observable<MediaStream | null> {
    return this.remoteStreamSubject.asObservable();
  }

  get connectionState$(): Observable<string> {
    return this.connectionStateSubject.asObservable();
  }

  get cameraError$(): Observable<string | null> {
    return this.cameraErrorSubject.asObservable();
  }

  async init(): Promise<void> {
    // Idempotent: if we already have a local stream, just re-emit it. This
    // matters because callFriend/acceptIncomingCall init() inside the click
    // gesture, and the widget's match_found handler also calls init() — we must
    // not re-fetch (which would replace the stream the peer connection already
    // attached tracks from) or leave localStream null on the second call.
    if (this.localStream) {
      this.localStreamSubject.next(this.localStream);
      return;
    }
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      this.cameraErrorSubject.next(null);
      this.localStreamSubject.next(this.localStream);
    } catch (err: any) {
      // Most common on mobile: the page is served over an insecure origin
      // (http://LAN-IP:4200 instead of localhost/HTTPS), so getUserMedia
      // is blocked. Surface it instead of hanging on "Connecting…".
      const msg = err?.name === 'NotAllowedError'
        ? 'Camera/mic permission denied'
        : 'Camera/mic unavailable (needs HTTPS or localhost)';
      console.error('Failed to get user media:', err);
      this.cameraErrorSubject.next(msg);
    }
  }

  async createPeerConnection(matchId: string): Promise<void> {
    const bufferedOffer = this.pendingOffer?.offer ?? null;
    this.currentMatchId = matchId;
    this.pendingCandidates = [];
    this.pendingOffer = null;
    // Phase 4: fresh call = fresh stats window (and a fresh one-shot report).
    this.statsMatchId = matchId;
    this.callConnectedAt = null;
    this.statsReported = false;
    this.clearStatsTimer();
    const ice = await this.ensureIceServers();
    this.peerConnection = new RTCPeerConnection(ice);

    this.remoteStream = new MediaStream();
    this.remoteStreamSubject.next(this.remoteStream);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
      // P4b: negotiate tiered resolution + cap the outgoing bitrate.
      void this.applyVideoQuality();
    }

    this.peerConnection.ontrack = (event) => {
      const track = event.track;
      if (track) {
        this.remoteStream!.addTrack(track);
        this.remoteStreamSubject.next(this.remoteStream);
        return;
      }
      // Fallback for browsers that associate the track with a stream.
      (event.streams[0]?.getTracks() ?? []).forEach(t => {
        this.remoteStream!.addTrack(t);
      });
      this.remoteStreamSubject.next(this.remoteStream);
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socketService.sendCandidate(matchId, event.candidate.toJSON());
      }
    };

    this.peerConnection.onconnectionstatechange = (event) => {
      // Use the event's target: during teardown `this.peerConnection` may
      // already be null while the queued 'closed' event still fires.
      const pc = (event.target as RTCPeerConnection) || this.peerConnection;
      const state = pc?.connectionState || 'unknown';
      this.connectionStateSubject.next(state);

      if (state === 'connected') {
        if (!this.callConnectedAt) this.callConnectedAt = Date.now();
        this.clearStatsTimer();
      } else if (state === 'failed') {
        void this.reportCallStats(pc, 'failed');
      } else if (state === 'closed') {
        void this.reportCallStats(pc, 'closed');
      } else if (state === 'disconnected' && !this.statsReported) {
        // 'disconnected' often self-heals — only count it after 5s with no
        // recovery, otherwise transient blips would poison the success rate.
        this.clearStatsTimer();
        this.statsTimer = setTimeout(() => {
          if (pc?.connectionState === 'disconnected') void this.reportCallStats(pc, 'disconnected');
        }, 5_000);
      }
    };

    // If an offer arrived before the peer connection existed, apply it now.
    if (bufferedOffer) {
      await this.handleOffer(bufferedOffer);
    }
  }

  async createOffer(matchId: string): Promise<void> {
    if (!this.peerConnection) return;
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    this.socketService.sendOffer(matchId, offer);
  }

  toggleCamera(): void {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
      }
    }
  }

  toggleMicrophone(): void {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
      }
    }
  }

  async switchCamera(): Promise<void> {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const currentFacing = (videoTrack as any).getSettings()?.facingMode;
    const newFacing = currentFacing === 'user' ? 'environment' : 'user';

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: newFacing },
      audio: false,
    });

    const newVideoTrack = newStream.getVideoTracks()[0];

    if (this.peerConnection) {
      const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
      sender?.replaceTrack(newVideoTrack);
    }

    videoTrack.stop();
    this.localStream.removeTrack(videoTrack);
    this.localStream.addTrack(newVideoTrack);
    this.localStreamSubject.next(this.localStream);
  }

  // ---------------------------------------------------------------------------
  // Phase 4: call-quality instrumentation + tiered media hardening.
  // ---------------------------------------------------------------------------

  private clearStatsTimer(): void {
    if (this.statsTimer !== null) {
      clearTimeout(this.statsTimer);
      this.statsTimer = null;
    }
  }

  /**
   * Report the final outcome of the current call — connection result,
   * selected transport (udp/tcp/relay), RTT of the chosen candidate pair and
   * connected duration. One small emit per call; every step is best-effort so
   * instrumentation can never break a call or its teardown.
   */
  private async reportCallStats(pc: RTCPeerConnection | null, finalState: string): Promise<void> {
    if (this.statsReported) return;
    // A call that closed before ever connecting isn't an ICE outcome.
    if (finalState === 'closed' && !this.callConnectedAt) return;
    this.statsReported = true;
    this.clearStatsTimer();

    const payload: {
      matchId: string | null;
      outcome: string;
      transport?: string;
      rttMs?: number;
      durationSec?: number;
    } = { matchId: this.statsMatchId, outcome: finalState };

    if (this.callConnectedAt) {
      payload.durationSec = Math.max(0, Math.round((Date.now() - this.callConnectedAt) / 1000));
    }

    try {
      const stats = await pc?.getStats();
      if (stats) {
        const reports = new Map<string, any>();
        stats.forEach((r: any) => reports.set(r.id, r));

        let pair: any = null;
        reports.forEach((r: any) => {
          if (r.type === 'candidate-pair' && (r.nominated || r.state === 'succeeded')) pair = r;
        });

        if (pair) {
          if (typeof pair.currentRoundTripTime === 'number') {
            payload.rttMs = Math.round(pair.currentRoundTripTime * 1000);
          }
          const local = reports.get(pair.localCandidateId);
          const remote = reports.get(pair.remoteCandidateId);
          const viaRelay = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
          const proto = String(local?.protocol ?? remote?.protocol ?? '').toLowerCase();
          payload.transport = viaRelay ? 'relay' : proto === 'tcp' ? 'tcp' : 'udp';
        }
      }
    } catch { /* stats are best-effort */ }

    try {
      this.socketService.emit('call_stats', payload);
    } catch { /* never break teardown */ }
  }

  /**
   * P4b: negotiate outgoing video quality per tier. Free: 480p ~800 kbps;
   * premium: 720p ~2.5 Mbps. Resolution is requested from the capture device
   * (cheaper than downscaling locally) and the bitrate is capped on the
   * RTCRtpSender so a slow peer can't saturate the uplink.
   */
  private async applyVideoQuality(): Promise<void> {
    try {
      const videoTrack = this.localStream?.getVideoTracks()[0];
      if (videoTrack) {
        await videoTrack.applyConstraints(
          this.isPremium
            ? { width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 640 }, height: { ideal: 480 } },
        );
      }
      const sender = this.peerConnection?.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        const params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = this.isPremium ? 2_500_000 : 800_000;
        await sender.setParameters(params);
      }
    } catch { /* quality negotiation is best-effort */ }
  }

  disconnect(): void {
    this.clearStatsTimer();
    this.peerConnection?.close();
    this.peerConnection = null;
    this.currentMatchId = null;
    this.pendingCandidates = [];
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.remoteStream = null;
    this.pendingOffer = null;
    this.cameraErrorSubject.next(null);
    this.localStreamSubject.next(null);
    this.remoteStreamSubject.next(null);
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }
}
