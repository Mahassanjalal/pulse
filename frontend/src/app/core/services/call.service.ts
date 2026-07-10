import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface OutgoingCall {
  callId: string;
  calleeId: string;
  calleeName: string;
  calleeAvatar: string;
}

/**
 * State machine for direct (friend) calls. Drives two distinct UI surfaces:
 *  - 'calling'  : outgoing ring tone is playing, callee hasn't answered yet
 *                -> the AppComponent renders a centered "Calling…" modal.
 *  - 'active'   : the callee accepted and the WebRTC match is live
 *                -> the persistent floating FriendCallWidget takes over.
 *
 * Transitions:
 *   idle --callFriend--> calling --call_initiated--> calling (callId filled)
 *   calling --match_found(accept)--> active
 *   calling/active --cancel/decline/error/end--> idle
 */
export type CallState = 'idle' | 'calling' | 'active';

@Injectable({
  providedIn: 'root',
})
export class CallService {
  private callStateSubject = new BehaviorSubject<CallState>('idle');
  private outgoingCallSubject = new BehaviorSubject<OutgoingCall | null>(null);

  get state$(): Observable<CallState> {
    return this.callStateSubject.asObservable();
  }

  get outgoingCall$(): Observable<OutgoingCall | null> {
    return this.outgoingCallSubject.asObservable();
  }

  get current(): OutgoingCall | null {
    return this.outgoingCallSubject.value;
  }

  get state(): CallState {
    return this.callStateSubject.value;
  }

  /** Begin ringing (outgoing). Widget stays hidden until accept(). */
  start(call: OutgoingCall): void {
    this.outgoingCallSubject.next(call);
    this.callStateSubject.next('calling');
  }

  /** Server confirmed the call was created (fills in the real callId). */
  setCallId(callId: string): void {
    const existing = this.outgoingCallSubject.value;
    if (!existing) return;
    if (existing.callId === callId) return;
    this.outgoingCallSubject.next({ ...existing, callId });
  }

  /** Callee accepted — promote to active so the floating widget shows. */
  activate(): void {
    if (this.callStateSubject.value === 'idle') return;
    this.callStateSubject.next('active');
  }

  /** Drop the call entirely (cancel/decline/error/end). */
  clear(): void {
    this.outgoingCallSubject.next(null);
    this.callStateSubject.next('idle');
  }
}
