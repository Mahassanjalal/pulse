import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { environment } from '@env/environment';
import { PresenceService } from './presence.service';

export interface Friend {
  friendId: string;
  peer: {
    id: string;
    displayName: string;
    profilePicture: string;
    status: string;
    lastSeen: string;
  };
  isFavorite: boolean;
}

export interface FriendRequest {
  id: string;
  fromUser?: { id: string; displayName: string; profilePicture: string; country: string };
  toUser?: { id: string; displayName: string; profilePicture: string; country: string };
  status: string;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class FriendService implements OnDestroy {
  private friends$ = new BehaviorSubject<Friend[]>([]);
  private receivedRequests$ = new BehaviorSubject<FriendRequest[]>([]);
  private sentRequests$ = new BehaviorSubject<FriendRequest[]>([]);
  private presenceSub: Subscription;

  constructor(private http: HttpClient, private presenceService: PresenceService) {
    this.presenceSub = this.presenceService.onPresenceChanged$.subscribe(({ userId, status }) => {
      const current = this.friends$.value;
      let changed = false;
      const updated = current.map(f => {
        if (f.peer.id === userId && f.peer.status !== status) {
          changed = true;
          return { ...f, peer: { ...f.peer, status } };
        }
        return f;
      });
      if (changed) {
        this.friends$.next(updated);
      }
    });
  }

  ngOnDestroy(): void {
    this.presenceSub?.unsubscribe();
  }

  get friendsObs(): Observable<Friend[]> {
    return this.friends$.asObservable();
  }

  get receivedRequestsObs(): Observable<FriendRequest[]> {
    return this.receivedRequests$.asObservable();
  }

  get sentRequestsObs(): Observable<FriendRequest[]> {
    return this.sentRequests$.asObservable();
  }

  loadFriends(): void {
    this.http.get<{ friends: Friend[] }>(`${environment.apiUrl}/friends`).subscribe({
      next: (res) => {
        this.friends$.next(res.friends);
        const friendIds = res.friends.map(f => f.peer.id);
        if (friendIds.length > 0) {
          this.presenceService.syncUsers(friendIds);
        }
      },
      error: () => this.friends$.next([])
    });
  }

  loadRequests(): void {
    this.http.get<{ received: FriendRequest[]; sent: FriendRequest[] }>(`${environment.apiUrl}/friends/requests`).subscribe({
      next: (res) => {
        this.receivedRequests$.next(res.received);
        this.sentRequests$.next(res.sent);
      },
      error: () => {
        this.receivedRequests$.next([]);
        this.sentRequests$.next([]);
      }
    });
  }

  sendRequest(toUserId: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/friends/request`, { toUserId });
  }

  acceptRequest(requestId: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/friends/requests/${requestId}/accept`, {});
  }

  rejectRequest(requestId: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/friends/requests/${requestId}/reject`, {});
  }

  removeFriend(friendId: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/friends/${friendId}`);
  }

  toggleFavorite(friendId: string): Observable<any> {
    return this.http.put(`${environment.apiUrl}/friends/${friendId}/favorite`, {});
  }
}
