import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { FriendService } from '../../core/services/friend.service';
import { PresenceService } from '../../core/services/presence.service';
import { PremiumModalService } from '../../core/services/premium-modal.service';
import { UserService } from '../../core/services/user.service';
import { environment } from '@env/environment';

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
  hasUnsavedChanges = false;
  toastMessage: string | null = null;
  private toastTimeout: any = null;

  showReportDialog = false;
  reportCategory = 'OTHER';
  reportDescription = '';
  reportSubmitted = false;

  editingField: string | null = null;
  editValue: string = '';
  newInterest: string = '';

  showDeleteConfirm = false;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private authService: AuthService,
    private friendService: FriendService,
    private presenceService: PresenceService,
    private premiumModalService: PremiumModalService,
    private router: Router,
    private userService: UserService
  ) {}

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

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
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toastMessage = null, 3000);
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
      this.userService.getUser(currentUser.id).subscribe({
        next: (res) => {
          this.user = res.user;
          this.liveStatus = res.user.status;
          this.parseInterests();
          this.isLoading = false;
          this.loadProfileVisitors();
          this.watchPresence(currentUser.id);
        },
        error: () => {
          this.isLoading = false;
          this.showToast('Failed to load profile');
        }
      });
    } else {
      this.isLoading = false;
    }
  }

  private loadUser(userId: string): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) return;
    this.isOwnProfile = currentUser.id === userId;

    this.userService.getUser(userId).subscribe({
      next: (res) => {
        this.user = res.user;
        this.liveStatus = res.user.status;
        this.parseInterests();
        this.isLoading = false;
        this.loadRelationshipStatus(userId);
        this.watchPresence(userId);
      },
      error: () => {
        this.isLoading = false;
        this.showToast('Failed to load profile');
      }
    });

    if (!this.isOwnProfile && currentUser) {
      this.userService.getMutualFriends(userId).subscribe({
        next: (res) => {
          this.mutualFriends = res.mutualFriends;
          this.mutualFriendsCount = res.count;
        },
        error: () => {}
      });
    }
  }

  private loadRelationshipStatus(userId: string): void {
    this.userService.getRelationshipStatus(userId).subscribe({
      next: (res) => {
        this.relationship = res.relationship;
        this.friendId = res.friendId;
      },
      error: () => {}
    });
  }

  private loadProfileVisitors(): void {
    if (!this.isOwnProfile) return;
    this.userService.getProfileVisitors().subscribe({
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
    this.hasUnsavedChanges = true;
  }

  cancelEdit(): void {
    this.editingField = null;
    this.editValue = '';
    this.hasUnsavedChanges = false;
  }

  saveField(field: string): void {
    const update: any = {};
    update[field] = this.editValue;
    this.userService.updateProfile(update).subscribe({
      next: () => {
        if (this.user) (this.user as any)[field] = this.editValue;
        this.editingField = null;
        this.hasUnsavedChanges = false;
        this.showToast('Profile updated');
      },
      error: () => {
        this.showToast('Failed to save changes');
      }
    });
  }

  addInterest(): void {
    const tag = this.newInterest.trim().toLowerCase();
    if (!tag || this.interests.includes(tag)) return;
    this.interests.push(tag);
    this.newInterest = '';
    this.hasUnsavedChanges = true;
    this.saveInterests();
  }

  removeInterest(interest: string): void {
    this.interests = this.interests.filter(i => i !== interest);
    this.hasUnsavedChanges = true;
    this.saveInterests();
  }

  private saveInterests(): void {
    this.userService.updateProfile({ interests: JSON.stringify(this.interests) }).subscribe({
      next: () => {
        this.hasUnsavedChanges = false;
        this.showToast('Interests updated');
      },
      error: () => this.showToast('Failed to update interests')
    });
  }

  sendFriendRequest(): void {
    if (!this.user) return;
    this.friendService.sendRequest(this.user.id).subscribe({
      next: () => {
        this.relationship = 'REQUEST_SENT';
        this.friendService.loadRequests();
        this.showToast('Friend request sent');
      },
      error: (err) => {
        if (err.error?.error?.includes('premium')) {
          this.premiumModalService.open();
        } else {
          this.showToast('Failed to send friend request');
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
        this.showToast('Friend removed');
      },
      error: () => this.showToast('Failed to remove friend')
    });
  }

  startChat(): void {
    if (!this.user) return;
    this.router.navigate(['/messages'], { queryParams: { userId: this.user.id } });
  }

  blockUser(): void {
    if (!this.user) return;
    this.userService.blockUser(this.user.id).subscribe({
      next: () => {
        this.relationship = 'BLOCKED';
        this.showToast('User blocked');
      },
      error: (err) => {
        if (err.status === 409) this.relationship = 'BLOCKED';
        else this.showToast('Failed to block user');
      }
    });
  }

  unblockUser(): void {
    if (!this.user) return;
    this.userService.unblockUser(this.user.id).subscribe({
      next: () => {
        this.relationship = 'NONE';
        this.loadRelationshipStatus(this.user!.id);
        this.showToast('User unblocked');
      },
      error: () => this.showToast('Failed to unblock user')
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
    this.userService.createReport(this.user.id, this.reportCategory, this.reportDescription).subscribe({
      next: () => {
        this.reportSubmitted = true;
        setTimeout(() => this.showReportDialog = false, 2000);
      },
      error: () => this.showToast('Failed to submit report')
    });
  }

  openDeleteConfirm(): void {
    this.showDeleteConfirm = true;
  }

  deleteAccount(): void {
    this.showDeleteConfirm = false;
    this.userService.deleteAccount().subscribe({
      next: () => this.authService.logout(),
      error: () => this.showToast('Failed to deactivate account')
    });
  }
}
