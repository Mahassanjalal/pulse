import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { User } from '@models/user.model';

export interface RegisterData {
  email?: string;
  phone?: string;
  username: string;
  displayName: string;
  password: string;
  age?: number;
  gender?: string;
  country?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUser$ = new BehaviorSubject<User | null>(null);
  private authenticated = false;
  private guest = false;

  get user$(): Observable<User | null> {
    return this.currentUser$.asObservable();
  }

  async login(email: string, password: string): Promise<User> {
    this.authenticated = true;
    const user = this.getMockUser({ email });
    this.currentUser$.next(user);
    return user;
  }

  async register(data: RegisterData): Promise<User> {
    this.authenticated = true;
    const user = this.getMockUser({ email: data.email, displayName: data.displayName });
    this.currentUser$.next(user);
    return user;
  }

  async loginWithGoogle(): Promise<User> {
    this.authenticated = true;
    const user = this.getMockUser({});
    this.currentUser$.next(user);
    return user;
  }

  async loginWithApple(): Promise<User> {
    return this.loginWithGoogle();
  }

  async loginWithPhone(phone: string, otp: string): Promise<User> {
    this.authenticated = true;
    const user = this.getMockUser({});
    this.currentUser$.next(user);
    return user;
  }

  async sendOtp(phone: string): Promise<void> {
    return;
  }

  async verifyOtp(phone: string, otp: string): Promise<User> {
    return this.loginWithGoogle();
  }

  async resetPassword(email: string): Promise<void> {
    return;
  }

  async recoverAccount(): Promise<void> {
    return;
  }

  async logout(): Promise<void> {
    this.authenticated = false;
    this.guest = false;
    this.currentUser$.next(null);
  }

  getCurrentUser(): User | null {
    return this.currentUser$.value;
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  isGuest(): boolean {
    return this.guest;
  }

  setGuest(): void {
    this.guest = true;
    this.authenticated = false;
  }

  private getMockUser(overrides: Partial<User>): User {
    return {
      id: 'user_' + Math.random().toString(36).substr(2, 9),
      username: 'johndoe',
      displayName: 'John Doe',
      email: 'john@example.com',
      profilePicture: 'https://i.pravatar.cc/200?img=1',
      coverImage: 'https://i.pravatar.cc/800?img=1',
      age: 24,
      gender: 'male',
      bio: 'Passionate about gaming, tech, and connecting with people worldwide.',
      country: 'US',
      languages: ['English', 'Spanish'],
      interests: ['Gaming', 'Tech', 'Music', 'Travel'],
      isVerified: true,
      isPremium: false,
      onlineStatus: 'online',
      friendsCount: 48,
      totalConversations: 142,
      joinedDate: new Date('2024-03-01'),
      trustScore: 85,
      verificationLevel: 2,
      communityRating: 4.8,
      coins: 1250,
      dailyStreak: 5,
      achievements: [],
      privacySettings: {
        hideAge: false,
        hideCountry: false,
        hideOnlineStatus: false,
        hideProfilePicture: false,
        privateProfile: false
      },
      preferences: {
        ageRange: { min: 18, max: 35 },
        interestsMatch: true,
        verifiedOnly: false,
        premiumOnly: false,
        invisibleMode: false
      },
      ...overrides
    };
  }
}
