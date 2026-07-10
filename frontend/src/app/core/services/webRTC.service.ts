import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { SocketService } from './socket.service';
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

  private iceServers: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      // TURN relays (with temp credentials, e.g. from a short-lived backend
      // token) let media traverse symmetric NATs / strict firewalls where
      // STUN-only peer-to-peer fails. For production scale (many concurrent
      // calls) replace P2P with an SFU (e.g. mediasoup/LiveKit) that relays
      // through TURN-independent infrastructure instead of burning TURN
      // bandwidth per call.
      ...(environment.turnServers ?? []),
    ]
  };

  constructor(private socketService: SocketService) {
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

  async init(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      this.localStreamSubject.next(this.localStream);
    } catch (err) {
      console.error('Failed to get user media:', err);
    }
  }

  async createPeerConnection(matchId: string): Promise<void> {
    const bufferedOffer = this.pendingOffer?.offer ?? null;
    this.currentMatchId = matchId;
    this.pendingCandidates = [];
    this.pendingOffer = null;
    this.peerConnection = new RTCPeerConnection(this.iceServers);

    this.remoteStream = new MediaStream();
    this.remoteStreamSubject.next(this.remoteStream);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
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

    this.peerConnection.onconnectionstatechange = () => {
      this.connectionStateSubject.next(this.peerConnection?.connectionState || 'unknown');
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

  disconnect(): void {
    this.peerConnection?.close();
    this.peerConnection = null;
    this.currentMatchId = null;
    this.pendingCandidates = [];
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.remoteStream = null;
    this.pendingOffer = null;
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
