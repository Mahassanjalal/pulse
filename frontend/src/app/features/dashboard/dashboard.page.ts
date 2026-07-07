import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { FriendService, Friend } from '../../core/services/friend.service';
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

@Component({
  selector: 'pulse-dashboard',
  templateUrl: './dashboard.page.html',
  styles: []
})
export class DashboardPageComponent implements OnInit {
  stats: DashboardStats | null = null;
  onlineCount = 0;
  friends: Friend[] = [];

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private friendService: FriendService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
    this.friendService.loadFriends();
    this.friendService.friendsObs.subscribe(friends => this.friends = friends.slice(0, 3));
  }

  private loadDashboard(): void {
    this.http.get<{ stats: DashboardStats; onlineCount: number }>(`${environment.apiUrl}/users/me/dashboard`).subscribe({
      next: (res) => {
        this.stats = res.stats;
        this.onlineCount = res.onlineCount;
      }
    });
  }

  startMatching(): void {
    this.router.navigate(['/video']);
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
