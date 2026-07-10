import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface OutgoingCall {
  callId: string;
  calleeId: string;
  calleeName: string;
  calleeAvatar: string;
}

/**
 * Shared state for outgoing friend calls. The friends page starts a call and
 * the app component renders the "calling..." overlay and reacts to server
 * events (call_initiated, call_declined, call_cancelled, call_error) using
 * this service as the single source of truth.
 */
@Injectable({
  providedIn: 'root',
})
export class CallService {
  private outgoingCallSubject = new BehaviorSubject<OutgoingCall | null>(null);

  get outgoingCall$(): Observable<OutgoingCall | null> {
    return this.outgoingCallSubject.asObservable();
  }

  get current(): OutgoingCall | null {
    return this.outgoingCallSubject.value;
  }

  start(call: OutgoingCall): void {
    this.outgoingCallSubject.next(call);
  }

  clear(): void {
    this.outgoingCallSubject.next(null);
  }
}
