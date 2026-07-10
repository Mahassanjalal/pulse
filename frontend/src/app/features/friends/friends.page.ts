import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FriendService } from '../../core/services/friend.service';
import { AuthService } from '../../core/services/auth.service';
import { PremiumModalService } from '../../core/services/premium-modal.service';
import { SocketService } from '../../core/services/socket.service';
import { CallService } from '../../core/services/call.service';
import { CallSoundService } from '../../core/services/call-sound.service';
import { Friend, FriendRequestItem } from '@models/user.model';
import { Subject, debounceTime, distinctUntilChanged, Subscription } from 'rxjs';

@Component({
  selector: 'pulse-friends',
  templateUrl: './friends.page.html',
  styles: []
})
export class FriendsPageComponent implements OnInit, OnDestroy {
  friends: Friend[] = [];
  receivedRequests: FriendRequestItem[] = [];
  sentRequests: FriendRequestItem[] = [];
  searchQuery = '';
  toastMessage: string | null = null;
  private toastTimeout: any = null;
  private subscriptions: Subscription[] = [];
  private searchSubject = new Subject<string>();
  private allFriends: Friend[] = [];

  constructor(
    private friendService: FriendService,
    private router: Router,
    public authService: AuthService,
    private premiumModalService: PremiumModalService,
    private socketService: SocketService,
    private callService: CallService,
    private callSoundService: CallSoundService
  ) {}

  ngOnInit(): void {
    this.friendService.loadFriends();
    this.friendService.loadRequests();
    this.subscriptions.push(
      this.friendService.friendsObs.subscribe(friends => {
        this.friends = friends;
        this.applySearch();
      })
    );
    this.subscriptions.push(this.friendService.receivedRequestsObs.subscribe(reqs => this.receivedRequests = reqs));
    this.subscriptions.push(this.friendService.sentRequestsObs.subscribe(reqs => this.sentRequests = reqs));
    this.subscriptions.push(
      this.searchSubject.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(() => this.applySearch())
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.searchSubject.complete();
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchQuery);
  }

  private applySearch(): void {
    if (!this.searchQuery.trim()) {
      this.allFriends = this.friends;
    } else {
      const q = this.searchQuery.toLowerCase();
      this.allFriends = this.friends.filter(f => f.peer.displayName.toLowerCase().includes(q));
    }
  }

  get onlineFriends(): Friend[] {
    return this.friends.filter(f => f.peer.status === 'ONLINE');
  }

  get filteredFriends(): Friend[] {
    // Exclude online friends here since they're already shown in the
    // "Online Now" section above (avoids listing them twice).
    const onlineIds = new Set(this.onlineFriends.map(f => f.friendId));
    return this.allFriends.filter(f => !onlineIds.has(f.friendId));
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toastMessage = null, 3000);
  }

  acceptRequest(requestId: string): void {
    this.friendService.acceptRequest(requestId).subscribe({
      next: () => {
        this.friendService.loadFriends();
        this.friendService.loadRequests();
        this.showToast('Friend request accepted');
      },
      error: () => this.showToast('Failed to accept request')
    });
  }

  rejectRequest(requestId: string): void {
    this.friendService.rejectRequest(requestId).subscribe({
      next: () => {
        this.friendService.loadRequests();
        this.showToast('Request declined');
      },
      error: () => this.showToast('Failed to decline request')
    });
  }

  removeFriend(friendId: string): void {
    this.friendService.removeFriend(friendId).subscribe({
      next: () => {
        this.friendService.loadFriends();
        this.showToast('Friend removed');
      },
      error: () => this.showToast('Failed to remove friend')
    });
  }

  openPremiumModal(): void {
    this.premiumModalService.open();
  }

  toggleFavorite(friendId: string): void {
    this.friendService.toggleFavorite(friendId).subscribe({
      next: () => this.friendService.loadFriends(),
      error: () => this.showToast('Failed to update favorite')
    });
  }

  callFriend(friend: Friend): void {
    // Unlock audio on the user gesture so the ringtone can play for the callee.
    this.callSoundService.unlock();
    this.socketService.callFriend(friend.peer.id);
    // Show a 'calling...' overlay; the server replies with call_initiated
    // (confirms) or call_error (busy/offline/not friends) which clears it.
    this.callService.start({
      callId: '',
      calleeId: friend.peer.id,
      calleeName: friend.peer.displayName,
      calleeAvatar: friend.peer.profilePicture || '',
    });
  }
}
