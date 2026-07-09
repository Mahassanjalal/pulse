import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { PresenceService } from '../../core/services/presence.service';
import { PremiumModalService } from '../../core/services/premium-modal.service';
import { UserService } from '../../core/services/user.service';
import { DiscoverUser } from '@models/user.model';

interface TaggedUser {
  id: string;
  name: string;
  age: number;
  location: string;
  avatar: string;
  interests: string[];
  isVerified: boolean;
  isPremium: boolean;
  isOnline: boolean;
  isTrending: boolean;
  languages: string;
  trustScore: number;
}

@Component({
  selector: 'pulse-discover',
  templateUrl: './discover.page.html',
  styles: []
})
export class DiscoverPageComponent implements OnInit, OnDestroy {
  users: TaggedUser[] = [];
  isLoading = true;
  hasError = false;
  currentUserPremium = false;
  private presenceSub: Subscription | null = null;

  constructor(
    private authService: AuthService,
    private presenceService: PresenceService,
    private premiumModalService: PremiumModalService,
    private router: Router,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    this.currentUserPremium = this.authService.getCurrentUser()?.isPremium || false;
    this.loadUsers();
    this.presenceSub = this.presenceService.onPresenceChanged$.subscribe(({ userId, status }) => {
      const online = status === 'ONLINE';
      const idx = this.users.findIndex(u => u.id === userId);
      if (idx !== -1 && this.users[idx].isOnline !== online) {
        this.users[idx] = { ...this.users[idx], isOnline: online };
      }
    });
  }

  ngOnDestroy(): void {
    this.presenceSub?.unsubscribe();
  }

  loadUsers(): void {
    this.isLoading = true;
    this.hasError = false;
    this.userService.getDiscoverUsers().subscribe({
      next: (res) => {
        this.users = res.users.map(u => ({
          id: u.id,
          name: u.displayName || u.id,
          age: u.age || 0,
          location: u.country || 'Unknown',
          avatar: u.profilePicture || 'https://i.pravatar.cc/400?img=' + Math.floor(Math.random() * 70),
          interests: this.parseJsonArray(u.interests),
          isVerified: u.isVerified,
          isPremium: u.isPremium,
          isOnline: u.status === 'ONLINE',
          isTrending: u.trustScore > 70,
          languages: u.languages || '',
          trustScore: u.trustScore,
        }));
        this.isLoading = false;
        this.presenceService.syncUsers(res.users.map(u => u.id));
      },
      error: () => {
        this.isLoading = false;
        this.hasError = true;
      }
    });
  }

  private parseJsonArray(value: string): string[] {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  viewProfile(userId: string): void {
    this.router.navigate(['/profile', userId]);
  }

  startVideoChat(userId: string): void {
    this.router.navigate(['/video']);
  }

  goPremium(): void {
    this.premiumModalService.open();
  }
}
