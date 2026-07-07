import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FriendService, Friend, FriendRequest } from '../../core/services/friend.service';
import { AuthService } from '../../core/services/auth.service';
import { PremiumModalService } from '../../core/services/premium-modal.service';

@Component({
  selector: 'pulse-friends',
  templateUrl: './friends.page.html',
  styles: []
})
export class FriendsPageComponent implements OnInit {
  friends: Friend[] = [];
  receivedRequests: FriendRequest[] = [];
  sentRequests: FriendRequest[] = [];
  searchQuery = '';

  constructor(
    private friendService: FriendService,
    private router: Router,
    public authService: AuthService,
    private premiumModalService: PremiumModalService
  ) {}

  ngOnInit(): void {
    this.friendService.loadFriends();
    this.friendService.loadRequests();
    this.friendService.friendsObs.subscribe(friends => this.friends = friends);
    this.friendService.receivedRequestsObs.subscribe(reqs => this.receivedRequests = reqs);
    this.friendService.sentRequestsObs.subscribe(reqs => this.sentRequests = reqs);
  }

  get onlineFriends(): Friend[] {
    return this.friends.filter(f => f.peer.status === 'ONLINE');
  }

  get filteredFriends(): Friend[] {
    if (!this.searchQuery) return this.friends;
    return this.friends.filter(f => f.peer.displayName.toLowerCase().includes(this.searchQuery.toLowerCase()));
  }

  acceptRequest(requestId: string): void {
    this.friendService.acceptRequest(requestId).subscribe(() => {
      this.friendService.loadFriends();
      this.friendService.loadRequests();
    });
  }

  rejectRequest(requestId: string): void {
    this.friendService.rejectRequest(requestId).subscribe(() => {
      this.friendService.loadRequests();
    });
  }

  removeFriend(friendId: string): void {
    this.friendService.removeFriend(friendId).subscribe(() => {
      this.friendService.loadFriends();
    });
  }

  openPremiumModal(): void {
    this.premiumModalService.open();
  }

  toggleFavorite(friendId: string): void {
    this.friendService.toggleFavorite(friendId).subscribe(() => {
      this.friendService.loadFriends();
    });
  }
}
