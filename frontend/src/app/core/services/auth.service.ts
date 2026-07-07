import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { User } from '@models/user.model';
import { environment } from '@env/environment';
import { SocketService } from './socket.service';

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

interface AuthResponse {
  user: Partial<User>;
  token: string;
  refreshToken: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUser$ = new BehaviorSubject<User | null>(null);
  private tokenKey = 'token';
  private refreshTokenKey = 'refreshToken';
  private userIdKey = 'userId';

  get user$(): Observable<User | null> {
    return this.currentUser$.asObservable();
  }

  constructor(private http: HttpClient, private socketService: SocketService) {
    this.loadUser();
  }

  private loadUser(): void {
    const token = localStorage.getItem(this.tokenKey);
    if (token) {
      this.fetchCurrentUser().subscribe({
        next: () => this.socketService.connect(),
        error: () => {}
      });
    }
  }

  async login(email: string, password: string): Promise<User> {
    const res = await this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, { email, password }).toPromise();
    if (res) {
      this.storeTokens(res.token, res.refreshToken, res.user.id!);
      this.currentUser$.next(res.user as User);
      this.socketService.connect();
      return res.user as User;
    }
    throw new Error('Login failed');
  }

  async register(data: RegisterData): Promise<User> {
    const res = await this.http.post<AuthResponse>(`${environment.apiUrl}/auth/register`, data).toPromise();
    if (res) {
      this.storeTokens(res.token, res.refreshToken, res.user.id!);
      this.currentUser$.next(res.user as User);
      this.socketService.connect();
      return res.user as User;
    }
    throw new Error('Registration failed');
  }

  async loginWithGoogle(): Promise<User> {
    throw new Error('Google login not yet implemented on backend');
  }

  async loginWithApple(): Promise<User> {
    throw new Error('Apple login not yet implemented on backend');
  }

  async loginWithPhone(phone: string, otp: string): Promise<User> {
    throw new Error('Phone login not yet implemented on backend');
  }

  async sendOtp(phone: string): Promise<void> {
    throw new Error('OTP not yet implemented on backend');
  }

  async verifyOtp(phone: string, otp: string): Promise<User> {
    throw new Error('OTP verification not yet implemented on backend');
  }

  async resetPassword(email: string): Promise<void> {
    throw new Error('Password reset not yet implemented on backend');
  }

  async recoverAccount(): Promise<void> {
    throw new Error('Account recovery not yet implemented on backend');
  }

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem(this.refreshTokenKey);
    try {
      await this.http.post(`${environment.apiUrl}/auth/logout`, { refreshToken }).toPromise();
    } catch {
      // ignore
    }
    this.socketService.disconnect();
    this.clearTokens();
    this.currentUser$.next(null);
  }

  getCurrentUser(): User | null {
    return this.currentUser$.value;
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem(this.tokenKey) && !!this.currentUser$.value;
  }

  isGuest(): boolean {
    return this.currentUser$.value?.isGuest || false;
  }

  setGuest(): void {
    this.http.post<{ user: Partial<User>; token: string }>(`${environment.apiUrl}/auth/guest`, {}).subscribe({
      next: (res) => {
        localStorage.setItem(this.tokenKey, res.token);
        localStorage.setItem(this.userIdKey, res.user.id || '');
        this.currentUser$.next(res.user as User);
        this.socketService.connect();
      },
      error: () => {}
    });
  }

  fetchCurrentUser(): Observable<{ user: User }> {
    return this.http.get<{ user: User }>(`${environment.apiUrl}/auth/me`).pipe(
      tap({
        next: (res) => {
          this.currentUser$.next(res.user);
          localStorage.setItem(this.userIdKey, res.user.id);
        },
        error: () => {
          this.clearTokens();
          this.currentUser$.next(null);
        }
      })
    );
  }

  async refreshToken(): Promise<string | null> {
    const refreshToken = localStorage.getItem(this.refreshTokenKey);
    if (!refreshToken) return null;

    try {
      const res = await this.http.post<{ token: string }>(`${environment.apiUrl}/auth/refresh`, { refreshToken }).toPromise();
      if (res) {
        localStorage.setItem(this.tokenKey, res.token);
        return res.token;
      }
    } catch {
      this.clearTokens();
    }
    return null;
  }

  private storeTokens(token: string, refreshToken: string, userId: string): void {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.refreshTokenKey, refreshToken);
    localStorage.setItem(this.userIdKey, userId);
  }

  private clearTokens(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.userIdKey);
  }
}

