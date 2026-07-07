import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { SocketService } from './socket.service';

@Injectable({
  providedIn: 'root'
})
export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  private localStreamSubject = new BehaviorSubject<MediaStream | null>(null);
  private remoteStreamSubject = new BehaviorSubject<MediaStream | null>(null);
  private connectionStateSubject = new Subject<string>();

  private iceServers: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ]
  };

  constructor(private socketService: SocketService) {
    this.socketService.on('webrtc_offer').subscribe(async (data: any) => {
      if (!this.peerConnection) return;
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      this.socketService.sendAnswer(data.fromUserId || '', answer);
    });

    this.socketService.on('webrtc_answer').subscribe(async (data: any) => {
      if (!this.peerConnection) return;
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    this.socketService.on('webrtc_candidate').subscribe(async (data: any) => {
      if (!this.peerConnection || !data.candidate) return;
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('Error adding ice candidate', e);
      }
    });
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
    this.peerConnection = new RTCPeerConnection(this.iceServers);

    this.remoteStream = new MediaStream();
    this.remoteStreamSubject.next(this.remoteStream);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    this.peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => {
        this.remoteStream!.addTrack(track);
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
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.remoteStream = null;
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
