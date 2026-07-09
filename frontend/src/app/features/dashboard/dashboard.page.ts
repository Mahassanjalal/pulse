import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { FriendService } from '../../core/services/friend.service';
import { PresenceService } from '../../core/services/presence.service';
import { UserService } from '../../core/services/user.service';
import { DashboardStats, TrendingUser, Friend } from '@models/user.model';

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
  isLoading = true;
  hasError = false;
  private presenceSub: Subscription | null = null;

  constructor(
    private authService: AuthService,
    private friendService: FriendService,
    private presenceService: PresenceService,
    private userService: UserService,
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

  loadDashboard(): void {
    this.isLoading = true;
    this.hasError = false;
    this.userService.getDashboard().subscribe({
      next: (res) => {
        this.stats = res.stats;
        this.onlineCount = res.onlineCount;
        this.trending = (res.trending || []).map(u => ({
          ...u,
          interests: this.parseJson(u.interests),
        }));
        this.isLoading = false;
        this.presenceSub = this.presenceService.onPresenceChanged$.subscribe(({ status }) => {
          if (status === 'ONLINE') {
            this.onlineCount++;
          } else if (status === 'OFFLINE') {
            this.onlineCount = Math.max(0, this.onlineCount - 1);
          }
        });
      },
      error: () => {
        this.isLoading = false;
        this.hasError = true;
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
    this.userService.claimDailyReward().subscribe({
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
