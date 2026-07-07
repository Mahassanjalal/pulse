import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '@env/environment';

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
export class FriendService {
  private friends$ = new BehaviorSubject<Friend[]>([]);
  private receivedRequests$ = new BehaviorSubject<FriendRequest[]>([]);
  private sentRequests$ = new BehaviorSubject<FriendRequest[]>([]);

  constructor(private http: HttpClient) {}

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
      next: (res) => this.friends$.next(res.friends),
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
