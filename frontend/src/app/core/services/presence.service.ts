import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { SocketService } from './socket.service';

export interface PresenceEntry {
  status: string;
  lastSeen: Date;
}

@Injectable({
  providedIn: 'root'
})
export class PresenceService implements OnDestroy {
  private statusCache = new Map<string, BehaviorSubject<PresenceEntry>>();
  private presenceChanged$ = new Subject<{ userId: string; status: string; lastSeen: Date }>();
  private subscriptions: Subscription[] = [];

  constructor(private socketService: SocketService) {
    this.subscriptions.push(
      this.socketService.on('presence_changed').subscribe((data: any) => {
        const entry: PresenceEntry = { status: data.status, lastSeen: new Date(data.lastSeen) };
        if (this.statusCache.has(data.userId)) {
          this.statusCache.get(data.userId)!.next(entry);
        } else {
          this.statusCache.set(data.userId, new BehaviorSubject(entry));
        }
        this.presenceChanged$.next({ userId: data.userId, ...entry });
      })
    );

    this.subscriptions.push(
      this.socketService.on('presence_sync_result').subscribe((data: any) => {
        if (data.users) {
          for (const user of data.users) {
            const entry: PresenceEntry = { status: user.status, lastSeen: new Date(user.lastSeen) };
            if (this.statusCache.has(user.id)) {
              this.statusCache.get(user.id)!.next(entry);
            } else {
              this.statusCache.set(user.id, new BehaviorSubject(entry));
            }
          }
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  watchUser(userId: string): Observable<PresenceEntry> {
    if (!this.statusCache.has(userId)) {
      this.statusCache.set(userId, new BehaviorSubject({ status: 'OFFLINE', lastSeen: new Date() }));
    }
    return this.statusCache.get(userId)!.asObservable();
  }

  getStatus(userId: string): string {
    return this.statusCache.get(userId)?.value?.status || 'OFFLINE';
  }

  get onPresenceChanged$(): Observable<{ userId: string; status: string; lastSeen: Date }> {
    return this.presenceChanged$.asObservable();
  }

  syncUsers(userIds: string[]): void {
    this.socketService.requestPresenceSync(userIds);
  }
}
