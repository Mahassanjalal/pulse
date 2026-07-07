import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { environment } from '@env/environment';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private connectionState$ = new Subject<'connected' | 'disconnected' | 'reconnecting'>();
  private eventHandlers = new Map<string, Subject<any>>();

  connect(): void {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    if (!token || !userId) return;

    this.socket = io(environment.wsUrl, {
      auth: { token, userId },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => this.connectionState$.next('connected'));
    this.socket.on('disconnect', () => this.connectionState$.next('disconnected'));
    this.socket.on('reconnect_attempt', () => this.connectionState$.next('reconnecting'));

    const events = [
      'match_found', 'match_skipped', 'match_ended', 'matching', 'matching_queue', 'matching_cancelled',
      'webrtc_offer', 'webrtc_answer', 'webrtc_candidate',
      'match_message', 'match_message_sent', 'peer_typing',
      'friend_request_notification', 'friend_request_received', 'friend_request_accepted', 'friend_added',
      'notification',
    ];

    events.forEach(event => {
      const subject = new Subject<any>();
      this.eventHandlers.set(event, subject);
      this.socket?.on(event, (data: any) => subject.next(data));
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.eventHandlers.forEach(s => s.complete());
    this.eventHandlers.clear();
  }

  on(event: string): Observable<any> {
    if (!this.eventHandlers.has(event)) {
      const subject = new Subject<any>();
      this.eventHandlers.set(event, subject);
      this.socket?.on(event, (data: any) => subject.next(data));
    }
    return this.eventHandlers.get(event)!.asObservable();
  }

  emit(event: string, data?: any): void {
    this.socket?.emit(event, data);
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getConnectionState(): Observable<'connected' | 'disconnected' | 'reconnecting'> {
    return this.connectionState$.asObservable();
  }

  startMatching(filters?: any): void {
    this.emit('start_matching', { filters });
  }

  cancelMatching(): void {
    this.emit('cancel_matching');
  }

  sendOffer(matchId: string, offer: RTCSessionDescriptionInit): void {
    this.emit('webrtc_offer', { matchId, offer });
  }

  sendAnswer(matchId: string, answer: RTCSessionDescriptionInit): void {
    this.emit('webrtc_answer', { matchId, answer });
  }

  sendCandidate(matchId: string, candidate: RTCIceCandidateInit): void {
    this.emit('webrtc_candidate', { matchId, candidate });
  }

  sendMatchMessage(matchId: string, content: string, type = 'TEXT'): void {
    this.emit('send_match_message', { matchId, content, type });
  }

  sendTyping(matchId: string, isTyping: boolean): void {
    this.emit('typing', { matchId, isTyping });
  }

  skipMatch(matchId: string): void {
    this.emit('skip_match', { matchId });
  }

  endMatch(matchId: string): void {
    this.emit('end_match', { matchId });
  }

  sendFriendRequest(toUserId: string): void {
    this.emit('add_friend', { peerId: toUserId });
  }
}
