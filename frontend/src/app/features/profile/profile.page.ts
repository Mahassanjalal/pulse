import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { FriendService } from '../../core/services/friend.service';
import { PresenceService } from '../../core/services/presence.service';
import { PremiumModalService } from '../../core/services/premium-modal.service';
import { environment } from '@env/environment';
import { tap } from 'rxjs/operators';

interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  age?: number;
  gender?: string;
  bio?: string;
  country?: string;
  languages: string;
  interests: string;
  profilePicture?: string;
  coverImage?: string;
  isVerified: boolean;
  isPremium: boolean;
  status: string;
  trustScore: number;
  verificationLevel: number;
  communityRating: number;
  friendsCount: number;
  totalConversations: number;
  createdAt: string;
  privacySettings?: any;
  isPrivate?: boolean;
}

@Component({
  selector: 'pulse-profile',
  templateUrl: './profile.page.html',
  styles: []
})
export class ProfilePageComponent implements OnInit, OnDestroy {
  user: UserProfile | null = null;
  isOwnProfile = false;
  mutualFriends: any[] = [];
  mutualFriendsCount = 0;
  profileVisitors: any[] = [];
  interests: string[] = [];
  relationship: string = 'NONE';
  friendId: string | null = null;
  isLoading = true;
  liveStatus = 'OFFLINE';
  private presenceSub: Subscription | null = null;

  showReportDialog = false;
  reportCategory = 'OTHER';
  reportDescription = '';
  reportSubmitted = false;

  editingField: string | null = null;
  editValue: string = '';
  newInterest: string = '';

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private authService: AuthService,
    private friendService: FriendService,
    private presenceService: PresenceService,
    private premiumModalService: PremiumModalService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.isLoading = true;
      const userId = params['id'];
      if (userId) {
        this.loadUser(userId);
      } else {
        this.loadOwnProfile();
      }
    });
  }

  ngOnDestroy(): void {
    this.presenceSub?.unsubscribe();
  }

  private watchPresence(userId: string): void {
    this.presenceSub?.unsubscribe();
    this.presenceService.syncUsers([userId]);
    this.presenceSub = this.presenceService.watchUser(userId).subscribe(entry => {
      this.liveStatus = entry.status;
    });
  }

  private loadOwnProfile(): void {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.isOwnProfile = true;
      this.http.get<{ user: UserProfile }>(`${environment.apiUrl}/users/${currentUser.id}`).subscribe({
        next: (res) => {
          this.user = res.user;
          this.liveStatus = res.user.status;
          this.parseInterests();
          this.isLoading = false;
          this.loadProfileVisitors();
          this.watchPresence(currentUser.id);
        },
        error: () => this.isLoading = false
      });
    } else {
      this.isLoading = false;
    }
  }

  private loadUser(userId: string): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) return;
    this.isOwnProfile = currentUser.id === userId;

    this.http.get<{ user: UserProfile }>(`${environment.apiUrl}/users/${userId}`).subscribe({
      next: (res) => {
        this.user = res.user;
        this.liveStatus = res.user.status;
        this.parseInterests();
        this.isLoading = false;
        this.loadRelationshipStatus(userId);
        this.watchPresence(userId);
      },
      error: () => this.isLoading = false
    });

    if (!this.isOwnProfile && currentUser) {
      this.http.get<{ mutualFriends: any[]; count: number }>(`${environment.apiUrl}/users/${userId}/mutual-friends`).subscribe({
        next: (res) => {
          this.mutualFriends = res.mutualFriends;
          this.mutualFriendsCount = res.count;
        }
      });
    }
  }

  private loadRelationshipStatus(userId: string): void {
    this.http.get<{ relationship: string; friendId: string | null }>(`${environment.apiUrl}/users/${userId}/status`).subscribe({
      next: (res) => {
        this.relationship = res.relationship;
        this.friendId = res.friendId;
      }
    });
  }

  private loadProfileVisitors(): void {
    if (!this.isOwnProfile) return;
    this.http.get<{ visitors: any[] }>(`${environment.apiUrl}/users/me/visitors`).subscribe({
      next: (res) => this.profileVisitors = res.visitors,
      error: () => {}
    });
  }

  private parseInterests(): void {
    if (this.user?.interests) {
      try {
        this.interests = JSON.parse(this.user.interests);
      } catch {
        this.interests = [];
      }
    }
  }

  get joinedDate(): string {
    if (!this.user?.createdAt) return '';
    return new Date(this.user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  startEdit(field: string, currentValue: string): void {
    this.editingField = field;
    this.editValue = currentValue || '';
  }

  cancelEdit(): void {
    this.editingField = null;
    this.editValue = '';
  }

  saveField(field: string): void {
    const update: any = {};
    update[field] = this.editValue;
    this.http.patch(`${environment.apiUrl}/users/me/profile`, update).subscribe({
      next: () => {
        if (this.user) (this.user as any)[field] = this.editValue;
        this.editingField = null;
      },
      error: () => {}
    });
  }

  addInterest(): void {
    const tag = this.newInterest.trim().toLowerCase();
    if (!tag || this.interests.includes(tag)) return;
    this.interests.push(tag);
    this.newInterest = '';
    this.saveInterests();
  }

  removeInterest(interest: string): void {
    this.interests = this.interests.filter(i => i !== interest);
    this.saveInterests();
  }

  private saveInterests(): void {
    this.http.patch(`${environment.apiUrl}/users/me/profile`, { interests: JSON.stringify(this.interests) }).subscribe();
  }

  sendFriendRequest(): void {
    if (!this.user) return;
    this.friendService.sendRequest(this.user.id).subscribe({
      next: () => {
        this.relationship = 'REQUEST_SENT';
        this.friendService.loadRequests();
      },
      error: (err) => {
        if (err.error?.error?.includes('premium')) {
          this.premiumModalService.open();
        }
      }
    });
  }

  unfriend(): void {
    if (!this.friendId) return;
    this.friendService.removeFriend(this.friendId).subscribe({
      next: () => {
        this.relationship = 'NONE';
        this.friendId = null;
        this.friendService.loadFriends();
      }
    });
  }

  startChat(): void {
    if (!this.user) return;
    this.router.navigate(['/messages'], { queryParams: { userId: this.user.id } });
  }

  blockUser(): void {
    if (!this.user) return;
    this.http.post(`${environment.apiUrl}/users/block`, { userId: this.user.id }).subscribe({
      next: () => {
        this.relationship = 'BLOCKED';
      },
      error: (err) => {
        if (err.status === 409) this.relationship = 'BLOCKED';
      }
    });
  }

  unblockUser(): void {
    if (!this.user) return;
    this.http.delete(`${environment.apiUrl}/users/block/${this.user.id}`).subscribe({
      next: () => {
        this.relationship = 'NONE';
        this.loadRelationshipStatus(this.user!.id);
      }
    });
  }

  openReportDialog(): void {
    this.showReportDialog = true;
    this.reportCategory = 'OTHER';
    this.reportDescription = '';
    this.reportSubmitted = false;
  }

  submitReport(): void {
    if (!this.user || this.reportDescription.length < 10) return;
    this.http.post(`${environment.apiUrl}/reports`, {
      reportedUserId: this.user.id,
      category: this.reportCategory,
      description: this.reportDescription,
    }).subscribe({
      next: () => {
        this.reportSubmitted = true;
        setTimeout(() => this.showReportDialog = false, 2000);
      },
      error: () => {}
    });
  }
}
