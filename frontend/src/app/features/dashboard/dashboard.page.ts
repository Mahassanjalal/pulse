import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { FriendService, Friend } from '../../core/services/friend.service';
import { PresenceService } from '../../core/services/presence.service';
import { environment } from '@env/environment';

interface DashboardStats {
  coins: number;
  dailyStreak: number;
  friendsCount: number;
  totalConversations: number;
  trustScore: number;
  isPremium: boolean;
  displayName: string;
  profilePicture: string;
  achievements: any[];
}

interface TrendingUserRaw {
  id: string;
  displayName: string;
  profilePicture: string;
  interests: string;
  isVerified: boolean;
  isPremium: boolean;
  country: string;
  status: string;
}

interface TrendingUser {
  id: string;
  displayName: string;
  profilePicture: string;
  interests: string[];
  isVerified: boolean;
  isPremium: boolean;
  country: string;
  status: string;
}

@Component({
  selector: 'pulse-dashboard',
  templateUrl: './dashboard.page.html',
  styles: []
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  stats: DashboardStats | null = null;
  onlineCount = 0;
  trending: TrendingUser[] = [];
  friends: Friend[] = [];
  claimError = '';
  claimSuccess = false;
  claimDisabled = false;
  private presenceSub: Subscription | null = null;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private friendService: FriendService,
    private presenceService: PresenceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
    this.friendService.loadFriends();
    this.friendService.friendsObs.subscribe(friends => this.friends = friends.slice(0, 3));
  }

  ngOnDestroy(): void {
    this.presenceSub?.unsubscribe();
  }

  private loadDashboard(): void {
    this.http.get<{ stats: DashboardStats; onlineCount: number; trending: TrendingUserRaw[] }>(`${environment.apiUrl}/users/me/dashboard`).subscribe({
      next: (res) => {
        this.stats = res.stats;
        this.onlineCount = res.onlineCount;
        this.trending = (res.trending || []).map(u => ({
          ...u,
          interests: this.parseJson(u.interests),
        }));
        this.presenceSub = this.presenceService.onPresenceChanged$.subscribe(({ status }) => {
          if (status === 'ONLINE') {
            this.onlineCount++;
          } else if (status === 'OFFLINE') {
            this.onlineCount = Math.max(0, this.onlineCount - 1);
          }
        });
      }
    });
  }

  private parseJson(val: string): string[] {
    try { return JSON.parse(val); } catch { return []; }
  }

  startMatching(): void {
    this.router.navigate(['/video']);
  }

  claimDailyReward(): void {
    this.claimDisabled = true;
    this.claimError = '';
    this.claimSuccess = false;
    this.http.post<{ coins: number; dailyStreak: number }>(`${environment.apiUrl}/users/me/daily-reward`, {}).subscribe({
      next: (res) => {
        if (this.stats) {
          this.stats.coins = res.coins;
          this.stats.dailyStreak = res.dailyStreak;
        }
        this.claimSuccess = true;
        this.claimDisabled = false;
      },
      error: (err) => {
        this.claimError = err.error?.error || 'Failed to claim reward';
        this.claimDisabled = false;
      }
    });
  }

  viewProfile(userId: string): void {
    this.router.navigate(['/profile', userId]);
  }

  onCardEnter(el: HTMLElement): void {
    el.style.borderColor = 'rgba(247, 172, 255, 0.4)';
    el.style.transform = 'translateY(-2px)';
  }

  onCardLeave(el: HTMLElement): void {
    el.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    el.style.transform = 'translateY(0)';
  }
}
