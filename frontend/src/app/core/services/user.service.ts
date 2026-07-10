import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { DashboardStats, TrendingUser, DiscoverUser, UserProfile } from '@models/user.model';

export interface UserSettings {
  settings: any;
  preferences: any;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  constructor(private http: HttpClient) {}

  getUser(userId: string): Observable<{ user: UserProfile }> {
    return this.http.get<{ user: UserProfile }>(`${environment.apiUrl}/users/${userId}`);
  }

  updateProfile(data: Partial<UserProfile>): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/users/me/profile`, data);
  }

  getSettings(): Observable<UserSettings> {
    return this.http.get<UserSettings>(`${environment.apiUrl}/users/me/settings`);
  }

  updateSettings(settings: any): Observable<any> {
    return this.http.put(`${environment.apiUrl}/users/me/settings`, settings);
  }

  updatePreferences(preferences: any): Observable<any> {
    return this.http.put(`${environment.apiUrl}/users/me/preferences`, preferences);
  }

  getDashboard(): Observable<{ stats: DashboardStats; onlineCount: number; trending: TrendingUser[] }> {
    return this.http.get<{ stats: DashboardStats; onlineCount: number; trending: TrendingUser[] }>(`${environment.apiUrl}/users/me/dashboard`);
  }

  claimDailyReward(): Observable<{ coins: number; dailyStreak: number }> {
    return this.http.post<{ coins: number; dailyStreak: number }>(`${environment.apiUrl}/users/me/daily-reward`, {});
  }

  getDiscoverUsers(): Observable<{ users: DiscoverUser[] }> {
    return this.http.get<{ users: DiscoverUser[] }>(`${environment.apiUrl}/users/discover`);
  }

  getMutualFriends(userId: string): Observable<{ mutualFriends: any[]; count: number }> {
    return this.http.get<{ mutualFriends: any[]; count: number }>(`${environment.apiUrl}/users/${userId}/mutual-friends`);
  }

  getRelationshipStatus(userId: string): Observable<{ relationship: string; friendId: string | null }> {
    return this.http.get<{ relationship: string; friendId: string | null }>(`${environment.apiUrl}/users/${userId}/status`);
  }

  getProfileVisitors(): Observable<{ visitors: any[] }> {
    return this.http.get<{ visitors: any[] }>(`${environment.apiUrl}/users/me/visitors`);
  }

  blockUser(userId: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/users/block`, { userId });
  }

  unblockUser(userId: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/users/block/${userId}`);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/auth/change-password`, { currentPassword, newPassword });
  }

  deleteAccount(): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/auth/account`);
  }

  createReport(reportedUserId: string, category: string, description: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/reports`, { reportedUserId, category, description });
  }
}
