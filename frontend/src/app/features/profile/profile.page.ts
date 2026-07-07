import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
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
export class ProfilePageComponent implements OnInit {
  user: UserProfile | null = null;
  isOwnProfile = false;
  mutualFriends: any[] = [];
  mutualFriendsCount = 0;
  interests: string[] = [];

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const userId = params['id'];
      if (userId) {
        this.loadUser(userId);
      } else {
        this.loadOwnProfile();
      }
    });
  }

  private loadOwnProfile(): void {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.isOwnProfile = true;
      this.http.get<{ user: UserProfile }>(`${environment.apiUrl}/users/${currentUser.id}`).subscribe({
        next: (res) => {
          this.user = res.user;
          this.parseInterests();
        }
      });
    }
  }

  private loadUser(userId: string): void {
    const currentUser = this.authService.getCurrentUser();
    this.isOwnProfile = currentUser?.id === userId;

    this.http.get<{ user: UserProfile }>(`${environment.apiUrl}/users/${userId}`).subscribe({
      next: (res) => {
        this.user = res.user;
        this.parseInterests();
      }
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
}
