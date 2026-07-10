import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, firstValueFrom } from 'rxjs';
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
  private loadingSubject = new BehaviorSubject<boolean>(true);
  public loading$ = this.loadingSubject.asObservable();
  private tokenKey = 'token';
  private refreshTokenKey = 'refreshToken';
  private userIdKey = 'userId';

  get user$(): Observable<User | null> {
    return this.currentUser$.asObservable();
  }

  constructor(private http: HttpClient, private socketService: SocketService) {
    // Defer boot to avoid a DI cycle: AuthService constructs -> loadUser()
    // -> HttpClient -> HTTP_INTERCEPTORS -> AuthInterceptor -> AuthService
    // (still constructing). A microtask lets the injector finish building
    // AuthService before any request triggers the interceptor.
    queueMicrotask(() => this.loadUser());
  }

  private loadUser(): void {
    const token = localStorage.getItem(this.tokenKey);
    if (token) {
      this.fetchCurrentUser().subscribe({
        next: () => {
          this.socketService.connect();
          this.loadingSubject.next(false);
        },
        error: (err: any) => {
          // fetchCurrentUser no longer clears the refresh token, so if we
          // still have one, the interceptor already attempted (and failed)
          // to refresh. At this point the session is dead — clean up.
          if (!localStorage.getItem(this.refreshTokenKey)) {
            this.clearTokens();
          }
          this.currentUser$.next(null);
          this.loadingSubject.next(false);
        }
      });
    } else {
      this.loadingSubject.next(false);
    }
  }

  async login(email: string, password: string): Promise<User> {
    const res = await firstValueFrom(this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, { email, password }));
    if (res) {
      this.storeTokens(res.token, res.refreshToken, res.user.id!);
      this.currentUser$.next(res.user as User);
      this.socketService.connect();
      return res.user as User;
    }
    throw new Error('Login failed');
  }

  async register(data: RegisterData): Promise<User> {
    const res = await firstValueFrom(this.http.post<AuthResponse>(`${environment.apiUrl}/auth/register`, data));
    if (res) {
      this.storeTokens(res.token, res.refreshToken, res.user.id!);
      this.currentUser$.next(res.user as User);
      this.socketService.connect();
      return res.user as User;
    }
    throw new Error('Registration failed');
  }

  async loginWithGoogle(credential: string): Promise<User> {
    const res = await firstValueFrom(this.http.post<AuthResponse>(`${environment.apiUrl}/auth/google`, { credential }));
    if (res) {
      this.storeTokens(res.token, res.refreshToken, res.user.id!);
      this.currentUser$.next(res.user as User);
      this.socketService.connect();
      return res.user as User;
    }
    throw new Error('Google login failed');
  }

  async loginWithApple(identityToken: string): Promise<User> {
    const res = await firstValueFrom(this.http.post<AuthResponse>(`${environment.apiUrl}/auth/apple`, { identityToken }));
    if (res) {
      this.storeTokens(res.token, res.refreshToken, res.user.id!);
      this.currentUser$.next(res.user as User);
      this.socketService.connect();
      return res.user as User;
    }
    throw new Error('Apple login failed');
  }

  async sendOtp(phone: string): Promise<{ devMode: boolean; code?: string }> {
    return firstValueFrom(this.http.post<{ devMode: boolean; code?: string }>(`${environment.apiUrl}/auth/send-otp`, { phone }));
  }

  async loginWithPhone(phone: string, otp: string): Promise<User> {
    const res = await firstValueFrom(this.http.post<AuthResponse>(`${environment.apiUrl}/auth/verify-otp`, { phone, code: otp }));
    if (res) {
      this.storeTokens(res.token, res.refreshToken, res.user.id!);
      this.currentUser$.next(res.user as User);
      this.socketService.connect();
      return res.user as User;
    }
    throw new Error('Phone login failed');
  }

  async verifyOtp(phone: string, otp: string): Promise<User> {
    return this.loginWithPhone(phone, otp);
  }

  async resetPassword(email: string): Promise<{ devMode: boolean; resetToken?: string }> {
    return firstValueFrom(this.http.post<{ devMode: boolean; resetToken?: string }>(`${environment.apiUrl}/auth/forgot-password`, { email }));
  }

  async recoverAccount(): Promise<{ devMode: boolean; resetToken?: string }> {
    // Account recovery shares the password-reset flow.
    throw new Error('Provide the account email to recoverAccount()');
  }

  async resetPasswordConfirm(token: string, newPassword: string): Promise<void> {
    await firstValueFrom(this.http.post(`${environment.apiUrl}/auth/reset-password`, { token, newPassword }));
  }

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem(this.refreshTokenKey);
    try {
      await firstValueFrom(this.http.post(`${environment.apiUrl}/auth/logout`, { refreshToken }));
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
          // Do not clear the refresh token here — the auth interceptor owns
          // token refresh and will invoke refreshToken() (which needs the
          // refresh token) before any logout. Only reset the in-memory user.
          localStorage.removeItem(this.tokenKey);
          this.currentUser$.next(null);
        }
      })
    );
  }

  async refreshToken(): Promise<string | null> {
    const refreshToken = localStorage.getItem(this.refreshTokenKey);
    if (!refreshToken) return null;

    try {
      const res = await firstValueFrom(this.http.post<{ token: string }>(`${environment.apiUrl}/auth/refresh`, { refreshToken }));
      if (res) {
        localStorage.setItem(this.tokenKey, res.token);
        return res.token;
      }
    } catch {
      this.clearTokens();
    }
    return null;
  }

  updateCurrentUser(user: Partial<User>): void {
    const current = this.currentUser$.value;
    if (current) {
      this.currentUser$.next({ ...current, ...user });
    }
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
