import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { environment } from '@env/environment';

@Injectable({
  providedIn: 'root'
})
export class SocketService implements OnDestroy {
  private socket: Socket | null = null;
  private connectionState$ = new Subject<'connected' | 'disconnected' | 'reconnecting'>();
  private eventHandlers = new Map<string, Subject<any>>();
  // Events that already have a live listener on the CURRENT socket, so we never
  // attach the same listener twice (e.g. across reconnects or re-calls).
  private attached = new Set<string>();
  private heartbeatInterval: any = null;
  private refreshingAuth = false;

  /**
   * Refresh the access token over HTTP (same endpoint the AuthInterceptor
   * uses) and persist the rotated pair. Returns null when no refresh token is
   * stored or the refresh fails.
   */
  private async refreshAuthToken(): Promise<{ token: string; refreshToken: string } | null> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${environment.apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.token) return null;
      localStorage.setItem('token', data.token);
      // Rotation: the server issues a new refresh token and invalidates the
      // old one — persist it or the next refresh fails.
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      return { token: data.token, refreshToken: data.refreshToken || refreshToken };
    } catch {
      return null;
    }
  }

  // Core events we always want a socket listener for once connected. Any event
  // already subscribed via on() before connect() runs is attached too (see
  // connect()), which fixes early subscribers being orphaned.
  private readonly events = [
    'match_found', 'match_skipped', 'match_ended', 'matching_queue', 'matching_cancelled',
    'webrtc_offer', 'webrtc_answer', 'webrtc_candidate',
    'match_message', 'match_message_sent', 'peer_typing',
    'friend_request_notification', 'friend_request_received', 'friend_request_accepted', 'friend_added',
    'notification', 'presence_changed', 'presence_sync_result', 'pong',
    'incoming_call', 'call_declined', 'call_cancelled', 'call_error', 'call_initiated',
  ];

  ngOnDestroy(): void {
    this.stopHeartbeat();
  }

  connect(): void {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    if (!token || !userId) return;

    this.socket = io(environment.wsUrl, {
      // H7: the access token lasts 15 minutes; send the refresh token too so
      // the server can re-authenticate a reconnecting socket when the access
      // token has expired (previously reconnects failed permanently and
      // realtime silently died until a full page reload).
      auth: { token, userId, refreshToken: localStorage.getItem('refreshToken') || undefined },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      this.connectionState$.next('connected');
      this.startHeartbeat();
    });
    this.socket.on('disconnect', () => {
      this.connectionState$.next('disconnected');
      this.stopHeartbeat();
    });
    this.socket.on('reconnect_attempt', () => this.connectionState$.next('reconnecting'));

    // H7: if the server rejects our handshake (expired access token without a
    // usable refresh token in auth), refresh credentials over HTTP and retry
    // with the fresh pair before the retry budget runs out.
    this.socket.on('connect_error', async (err: any) => {
      const msg = String(err?.message || '');
      if (!/token/i.test(msg) || this.refreshingAuth) return;
      this.refreshingAuth = true;
      try {
        const fresh = await this.refreshAuthToken();
        if (fresh && this.socket) {
          this.socket.auth = {
            token: fresh.token,
            userId: localStorage.getItem('userId'),
            refreshToken: fresh.refreshToken,
          };
          this.socket.connect();
        }
      } catch {
        // Give up quietly — reconnection attempts will keep trying with the
        // stored credentials; the app's HTTP layer handles hard session death.
      } finally {
        this.refreshingAuth = false;
      }
    });

    // Attach listeners for every core event AND any event already subscribed to
    // via on() (e.g. AppComponent's incoming_call, which subscribed before
    // connect() ran). Reuses the existing Subject so early subscribers keep
    // receiving events instead of being orphaned on a no-op listener.
    const eventsToAttach = new Set<string>([...this.events, ...this.eventHandlers.keys()]);
    eventsToAttach.forEach(event => this.attach(event));
  }

  /**
   * Ensures an event has a Subject and — if the socket is live — a socket
   * listener. Safe to call repeatedly: the listener is only ever attached once
   * per live socket (tracked via `attached`), and any pre-existing Subject is
   * reused so early subscribers are not disconnected from the stream.
   */
  private attach(event: string): void {
    if (this.attached.has(event)) return;
    let subject = this.eventHandlers.get(event);
    if (!subject) {
      subject = new Subject<any>();
      this.eventHandlers.set(event, subject);
    }
    if (this.socket) {
      this.attached.add(event);
      this.socket.on(event, (data: any) => subject!.next(data));
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.attached.clear();
    this.socket?.disconnect();
    this.socket = null;
    // Keep eventHandlers/Subjects alive so persistent subscribers (root
    // AppComponent, singleton services) survive a disconnect/reconnect instead
    // of being left on a completed/detached Subject.
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.emit('heartbeat');
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  requestPresenceSync(userIds: string[]): void {
    this.emit('presence_sync', { userIds });
  }

  on(event: string): Observable<any> {
    // Reuse the existing Subject (creating one if needed) and attach a socket
    // listener if the socket is live. Works whether called before or after
    // connect() — early subscribers are never orphaned.
    this.attach(event);
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

  callFriend(friendId: string): void {
    this.emit('call_friend', { friendId });
  }

  acceptCall(callId: string): void {
    this.emit('accept_call', { callId });
  }

  declineCall(callId: string): void {
    this.emit('decline_call', { callId });
  }

  cancelCall(callId: string): void {
    this.emit('cancel_call', { callId });
  }

  endDirectCall(matchId: string): void {
    this.emit('end_direct_call', { matchId });
  }
}
