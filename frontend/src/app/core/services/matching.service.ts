import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '@env/environment';
import { SocketService } from './socket.service';

export interface MatchData {
  userId: string;
  matchId: string;
  name: string;
  location: string;
  age: number;
  interests: string[];
  isVerified: boolean;
  isPremium: boolean;
  avatar: string;
  gender: string;
}

@Injectable({
  providedIn: 'root'
})
export class MatchingService {
  private status = 'idle';
  private timer = 0;
  private currentMatchId: string | null = null;

  private matchFound$ = new Subject<MatchData>();
  private statusChange$ = new Subject<string>();
  private timerUpdate$ = new Subject<number>();
  private matchSkipped$ = new Subject<void>();
  private matchEnded$ = new Subject<any>();
  private matchingQueue$ = new Subject<any>();
  private timerInterval: any = null;

  constructor(
    private http: HttpClient,
    private socketService: SocketService
  ) {
    this.socketService.on('match_found').subscribe((data: any) => {
      this.status = 'matched';
      this.statusChange$.next('matched');
      this.currentMatchId = data.matchId;
      this.matchFound$.next({
        userId: data.peer.id,
        matchId: data.matchId,
        name: data.peer.displayName || 'Unknown',
        location: data.peer.country || 'Unknown',
        age: data.peer.age || 0,
        interests: data.peer.interests || [],
        isVerified: data.peer.isVerified || false,
        isPremium: data.peer.isPremium || false,
        avatar: data.peer.profilePicture || '',
        gender: data.peer.gender || '',
      });
      this.startTimer();
    });

    this.socketService.on('matching_queue').subscribe((data: any) => {
      this.status = 'matching';
      this.statusChange$.next('matching');
      this.matchingQueue$.next(data);
    });

    this.socketService.on('matching_cancelled').subscribe(() => {
      this.status = 'idle';
      this.statusChange$.next('idle');
      this.stopTimer();
    });

    this.socketService.on('match_skipped').subscribe(() => {
      this.status = 'idle';
      this.statusChange$.next('idle');
      this.stopTimer();
      this.matchSkipped$.next();
    });

    this.socketService.on('match_ended').subscribe((data: any) => {
      this.status = 'idle';
      this.statusChange$.next('idle');
      this.stopTimer();
      this.currentMatchId = null;
      this.matchEnded$.next(data);
    });
  }

  get status$(): Observable<string> {
    return this.statusChange$.asObservable();
  }

  get matchFoundObs$(): Observable<MatchData> {
    return this.matchFound$.asObservable();
  }

  get timer$(): Observable<number> {
    return this.timerUpdate$.asObservable();
  }

  get matchSkippedObs$(): Observable<void> {
    return this.matchSkipped$.asObservable();
  }

  get matchEndedObs$(): Observable<any> {
    return this.matchEnded$.asObservable();
  }

  get currentStatus(): string {
    return this.status;
  }

  get currentMatch(): string | null {
    return this.currentMatchId;
  }

  startMatching(filters?: any): void {
    this.status = 'matching';
    this.statusChange$.next('matching');
    this.socketService.startMatching(filters);
  }

  skipMatch(): void {
    if (this.currentMatchId) {
      this.socketService.skipMatch(this.currentMatchId);
    }
  }

  reconnect(): void {
    this.startMatching();
  }

  pauseMatching(): void {
    this.socketService.cancelMatching();
    this.status = 'paused';
    this.statusChange$.next('paused');
  }

  resumeMatching(): void {
    if (this.status === 'paused') {
      this.startMatching();
    }
  }

  endMatch(): void {
    if (this.currentMatchId) {
      this.socketService.endMatch(this.currentMatchId);
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = 0;
    this.timerInterval = setInterval(() => {
      this.timer++;
      this.timerUpdate$.next(this.timer);
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timer = 0;
    this.timerUpdate$.next(0);
  }

}
