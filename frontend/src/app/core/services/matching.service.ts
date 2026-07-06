import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface MatchData {
  userId: string;
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
  private matchQuality = 'excellent';
  private matchFound$ = new Subject<MatchData | null>();
  private statusChange$ = new Subject<string>();
  private timerUpdate$ = new Subject<number>();
  private queuePosition = 0;

  get status$(): Observable<string> {
    return this.statusChange$.asObservable();
  }

  get matchFound$(): Observable<MatchData | null> {
    return this.matchFound$.asObservable();
  }

  get timer$(): Observable<number> {
    return this.timerUpdate$.asObservable();
  }

  get currentStatus(): string {
    return this.status;
  }

  get currentTimer(): number {
    return this.timer;
  }

  startMatching(filters?: any): void {
    this.status = 'matching';
    this.statusChange$.next('matching');
    this.timer = 0;
    this.simulateTimer();
    setTimeout(() => {
      this.status = 'matched';
      this.statusChange$.next('matched');
      this.matchFound$.next(this.getRandomMatch());
      this.startTimer();
    }, Math.random() * 5000 + 2000);
  }

  skipMatch(): void {
    this.status = 'idle';
    this.statusChange$.next('idle');
    this.timer = 0;
    this.timerUpdate$.next(0);
  }

  reconnect(): void {
    this.startMatching();
  }

  pauseMatching(): void {
    this.status = 'paused';
    this.statusChange$.next('paused');
  }

  resumeMatching(): void {
    if (this.status === 'paused') {
      this.startMatching();
    }
  }

  endMatch(): void {
    this.status = 'ended';
    this.statusChange$.next('ended');
    this.stopTimer();
  }

  private getRandomMatch(): MatchData {
    const names = ['Sarah', 'Alex', 'Emma', 'Lucas', 'Mia', 'Noah', 'Lily', 'Kai', 'Chloe', 'Leo'];
    const locations = ['London, UK', 'Tokyo, JP', 'Paris, FR', 'New York, US', 'Sydney, AU', 'Berlin, DE', 'Toronto, CA', 'Seoul, KR'];
    const interests = [
      ['Gaming', 'Tech'], ['Music', 'Art'], ['Travel', 'Photography'],
      ['Sports', 'Fitness'], ['Coding', 'Anime'], ['Food', 'Culture']
    ];
    const idx = Math.floor(Math.random() * names.length);
    return {
      userId: String(Math.random()),
      name: names[idx] + ' ' + String.fromCharCode(65 + Math.floor(Math.random() * 26)) + '.',
      location: locations[Math.floor(Math.random() * locations.length)],
      age: Math.floor(Math.random() * 15) + 18,
      interests: interests[idx] || [],
      isVerified: Math.random() > 0.5,
      isPremium: Math.random() > 0.7,
      avatar: 'https://example.com/avatar.jpg',
      gender: ['female', 'male'][Math.floor(Math.random() * 2)]
    };
  }

  private simulateTimer(): void {
    const interval = setInterval(() => {
      if (this.timer > 59) clearInterval(interval);
    }, 1000);
  }

  private startTimer(): void {
    const interval = setInterval(() => {
      this.timer++;
      this.timerUpdate$.next(this.timer);
      if (this.timer > 3600) clearInterval(interval);
    }, 1000);
  }

  private stopTimer(): void {
    this.timer = 0;
    this.timerUpdate$.next(0);
  }

  private getMatchQuality(): string {
    return this.matchQuality;
  }
}
