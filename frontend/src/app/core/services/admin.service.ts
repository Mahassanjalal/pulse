import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  isVerified: boolean;
  isPremium: boolean;
  status: string;
  trustScore: number;
  isLocked: boolean;
  role: string;
  coins?: number;
  createdAt: string;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  bio?: string;
  age?: number;
  gender?: string;
  country?: string;
  isVerified: boolean;
  isPremium: boolean;
  isLocked: boolean;
  status: string;
  trustScore: number;
  coins: number;
  role: string;
  friendsCount: number;
  totalConversations: number;
  isGuest?: boolean;
  premiumUntil?: string;
  boostedUntil?: string;
  subscription?: AdminSubscription | null;
}

export interface AdminReport {
  id: string;
  category: string;
  description: string;
  status: string;
  createdAt: string;
  reporter: { id: string; username: string };
  reportedUser: { id: string; username: string; trustScore?: number; isLocked?: boolean };
}

export interface AdminReportDetail extends AdminReport {
  reportedUser: {
    id: string; username: string; trustScore: number; isLocked: boolean;
    isPremium: boolean; createdAt: string;
  };
}

export interface AdminStats {
  totalUsers: number;
  onlineUsers: number;
  todaySignups: number;
  totalMatches: number;
  pendingReports: number;
  premiumUsers: number;
  bannedUsers: number;
  activeMatches: number;
  totalFriends: number;
  totalMessages: number;
  totalCoins: number;
  totalSubscriptions: number;
}

export interface AdminSession {
  id: string;
  token: string;
  userId: string;
  expiresAt: string;
}

export interface AdminLoginHistory {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  device: string | null;
  createdAt: string;
}

export interface AdminSubscription {
  id: string;
  userId: string;
  planType: string;
  price: number;
  period: string;
  isActive: boolean;
  startDate: string;
  endDate: string | null;
  user?: { id: string; username: string; isPremium: boolean };
}

export interface AdminCoinPackage {
  id: string;
  name: string;
  coins: number;
  priceUsd: number;
  bonus: number;
  popular: boolean;
  createdAt?: string;
}

export interface AdminCoinTransaction {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  refId: string | null;
  balanceAfter: number;
  createdAt: string;
  user?: { id: string; username: string };
}

export interface AdminFriend {
  id: string;
  senderId: string;
  receiverId: string;
  isFavorite: boolean;
  sender?: { id: string; username: string };
  receiver?: { id: string; username: string };
}

export interface AdminFriendRequest {
  id: string;
  status: string;
  fromUser?: { id: string; username: string };
  toUser?: { id: string; username: string };
}

export interface AdminBlock {
  id: string;
  userId: string;
  blockedUserId: string;
  reason: string | null;
  user?: { id: string; username: string };
}

export interface AdminMessage {
  id: string;
  matchId: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: string;
  deleted: boolean;
  createdAt: string;
  sender?: { id: string; username: string };
  receiver?: { id: string; username: string };
}

export interface AdminMatch {
  id: string;
  status: string;
  startTime: string;
  endTime: string | null;
  user1Id: string;
  user2Id: string;
  user1?: { id: string; username: string };
  user2?: { id: string; username: string };
}

export interface AdminNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface AdminAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  maxProgress: number;
}

export interface AdminSystemSetting {
  key: string;
  value: string;
  description: string | null;
}

export interface AdminAuditEntry {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  constructor(private http: HttpClient) {}

  // ---- Stats ----
  getStats(): Observable<AdminStats> {
    return this.http.get<AdminStats>(`${environment.apiUrl}/admin/stats`);
  }

  // ---- Users ----
  listUsers(page = 1, limit = 50, filters: { search?: string; role?: string; status?: string; verified?: string } = {}): Observable<{ users: AdminUser[]; total: number; page: number; limit: number }> {
    const params: any = { page: String(page), limit: String(limit) };
    if (filters.search) params.search = filters.search;
    if (filters.role) params.role = filters.role;
    if (filters.status) params.status = filters.status;
    if (filters.verified) params.verified = filters.verified;
    return this.http.get<any>(`${environment.apiUrl}/admin/users`, { params });
  }

  getUser(id: string): Observable<{ user: AdminUserDetail }> {
    return this.http.get<{ user: AdminUserDetail }>(`${environment.apiUrl}/admin/users/${id}`);
  }

  setRole(userId: string, role: 'USER' | 'ADMIN' | 'MODERATOR'): Observable<{ user: AdminUser }> {
    return this.http.put<{ user: AdminUser }>(`${environment.apiUrl}/admin/users/${userId}/role`, { role });
  }

  setVerified(userId: string, isVerified: boolean): Observable<{ user: AdminUser }> {
    return this.http.put<{ user: AdminUser }>(`${environment.apiUrl}/admin/users/${userId}/verify`, { isVerified });
  }

  lockUser(userId: string, reason: string): Observable<any> {
    return this.http.put(`${environment.apiUrl}/admin/users/${userId}/lock`, { reason });
  }

  unlockUser(userId: string): Observable<any> {
    return this.http.put(`${environment.apiUrl}/admin/users/${userId}/unlock`, {});
  }

  setTrust(userId: string, trustScore: number): Observable<any> {
    return this.http.put(`${environment.apiUrl}/admin/users/${userId}/trust`, { trustScore });
  }

  adjustCoins(userId: string, amount: number, reason?: string): Observable<{ balance: number }> {
    return this.http.put<{ balance: number }>(`${environment.apiUrl}/admin/users/${userId}/coins`, { amount, reason });
  }

  setPremium(userId: string, grant: boolean, planId?: string, period = 'monthly'): Observable<any> {
    return this.http.put(`${environment.apiUrl}/admin/users/${userId}/premium`, { grant, planId, period });
  }

  boostUser(userId: string, hours: number): Observable<any> {
    return this.http.put(`${environment.apiUrl}/admin/users/${userId}/boost`, { hours });
  }

  getUserAchievements(userId: string): Observable<{ achievements: AdminAchievement[] }> {
    return this.http.get<{ achievements: AdminAchievement[] }>(`${environment.apiUrl}/admin/users/${userId}/achievements`);
  }

  grantAchievement(userId: string, name: string, description?: string, icon?: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/admin/users/${userId}/achievements`, { name, description, icon });
  }

  revokeAchievement(userId: string, name: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/admin/users/${userId}/achievements/${encodeURIComponent(name)}`);
  }

  // ---- Sessions / Security ----
  getSessions(userId: string): Observable<{ sessions: AdminSession[] }> {
    return this.http.get<{ sessions: AdminSession[] }>(`${environment.apiUrl}/admin/users/${userId}/sessions`);
  }

  revokeSession(userId: string, tokenId: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/admin/users/${userId}/sessions/${tokenId}`);
  }

  revokeAllSessions(userId: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/admin/users/${userId}/sessions`);
  }

  getLoginHistory(userId: string): Observable<{ history: AdminLoginHistory[] }> {
    return this.http.get<{ history: AdminLoginHistory[] }>(`${environment.apiUrl}/admin/users/${userId}/login-history`);
  }

  // ---- Reports ----
  listReports(status = '', page = 1, limit = 50): Observable<{ reports: AdminReport[]; total: number; page: number; limit: number }> {
    const params: any = { page: String(page), limit: String(limit) };
    if (status) params.status = status;
    return this.http.get<any>(`${environment.apiUrl}/admin/reports`, { params });
  }

  getReport(id: string): Observable<{ report: AdminReportDetail }> {
    return this.http.get<{ report: AdminReportDetail }>(`${environment.apiUrl}/admin/reports/${id}`);
  }

  reviewReport(id: string): Observable<{ report: AdminReport }> {
    return this.http.post<{ report: AdminReport }>(`${environment.apiUrl}/admin/reports/${id}/review`, {});
  }

  resolveReport(id: string): Observable<{ report: AdminReport }> {
    return this.http.post<{ report: AdminReport }>(`${environment.apiUrl}/admin/reports/${id}/resolve`, {});
  }

  dismissReport(id: string): Observable<{ report: AdminReport }> {
    return this.http.post<{ report: AdminReport }>(`${environment.apiUrl}/admin/reports/${id}/dismiss`, {});
  }

  actOnReport(id: string, action: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/admin/reports/${id}/action`, { action });
  }

  // ---- Content ----
  listMessages(userId = '', matchId = '', page = 1, limit = 50): Observable<{ messages: AdminMessage[]; total: number; page: number; limit: number }> {
    const params: any = { page: String(page), limit: String(limit) };
    if (userId) params.userId = userId;
    if (matchId) params.matchId = matchId;
    return this.http.get<any>(`${environment.apiUrl}/admin/messages`, { params });
  }

  deleteMessage(id: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/admin/messages/${id}`);
  }

  listMatches(page = 1, limit = 50): Observable<{ matches: AdminMatch[]; total: number; page: number; limit: number }> {
    return this.http.get<any>(`${environment.apiUrl}/admin/matches`, { params: { page: String(page), limit: String(limit) } });
  }

  endMatch(id: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/admin/matches/${id}/end`, {});
  }

  deleteMatch(id: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/admin/matches/${id}`);
  }

  // ---- Social graph ----
  listFriends(userId = '', page = 1, limit = 50): Observable<{ friends: AdminFriend[]; total: number; page: number; limit: number }> {
    const params: any = { page: String(page), limit: String(limit) };
    if (userId) params.userId = userId;
    return this.http.get<any>(`${environment.apiUrl}/admin/friends`, { params });
  }

  removeFriend(id: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/admin/friends/${id}`);
  }

  listFriendRequests(status = '', page = 1, limit = 50): Observable<{ requests: AdminFriendRequest[]; total: number; page: number; limit: number }> {
    const params: any = { page: String(page), limit: String(limit) };
    if (status) params.status = status;
    return this.http.get<any>(`${environment.apiUrl}/admin/friend-requests`, { params });
  }

  cancelFriendRequest(id: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/admin/friend-requests/${id}`);
  }

  listBlocks(page = 1, limit = 50): Observable<{ blocks: AdminBlock[]; total: number; page: number; limit: number }> {
    return this.http.get<any>(`${environment.apiUrl}/admin/blocks`, { params: { page: String(page), limit: String(limit) } });
  }

  unblock(id: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/admin/blocks/${id}`);
  }

  listProfileViews(userId = ''): Observable<{ views: any[] }> {
    const params: any = {};
    if (userId) params.userId = userId;
    return this.http.get<{ views: any[] }>(`${environment.apiUrl}/admin/profile-views`, { params });
  }

  // ---- Premium / Billing ----
  listSubscriptions(page = 1, limit = 50): Observable<{ subscriptions: AdminSubscription[]; total: number; page: number; limit: number }> {
    return this.http.get<any>(`${environment.apiUrl}/admin/subscriptions`, { params: { page: String(page), limit: String(limit) } });
  }

  getUserSubscription(userId: string): Observable<{ subscription: AdminSubscription | null }> {
    return this.http.get<{ subscription: AdminSubscription | null }>(`${environment.apiUrl}/admin/subscriptions/${userId}`);
  }

  updateSubscription(userId: string, data: { endDate?: string; isActive?: boolean }): Observable<any> {
    return this.http.put(`${environment.apiUrl}/admin/subscriptions/${userId}`, data);
  }

  // ---- Coin packages ----
  listCoinPackages(): Observable<{ packages: AdminCoinPackage[] }> {
    return this.http.get<{ packages: AdminCoinPackage[] }>(`${environment.apiUrl}/admin/coin-packages`);
  }

  createCoinPackage(pkg: AdminCoinPackage): Observable<any> {
    return this.http.post(`${environment.apiUrl}/admin/coin-packages`, pkg);
  }

  updateCoinPackage(id: string, pkg: Partial<AdminCoinPackage>): Observable<any> {
    return this.http.put(`${environment.apiUrl}/admin/coin-packages/${id}`, pkg);
  }

  deleteCoinPackage(id: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/admin/coin-packages/${id}`);
  }

  // ---- Coin economy ----
  listCoinTransactions(userId = '', page = 1, limit = 50): Observable<{ transactions: AdminCoinTransaction[]; total: number; page: number; limit: number }> {
    const params: any = { page: String(page), limit: String(limit) };
    if (userId) params.userId = userId;
    return this.http.get<any>(`${environment.apiUrl}/admin/coin-transactions`, { params });
  }

  adjustUserCoins(userId: string, amount: number, reason?: string): Observable<{ balance: number }> {
    return this.http.post<{ balance: number }>(`${environment.apiUrl}/admin/coin-transactions/adjust`, { userId, amount, reason });
  }

  // ---- Notifications / Broadcast ----
  listNotifications(userId = '', page = 1, limit = 50): Observable<{ notifications: AdminNotification[]; total: number; page: number; limit: number }> {
    const params: any = { page: String(page), limit: String(limit) };
    if (userId) params.userId = userId;
    return this.http.get<any>(`${environment.apiUrl}/admin/notifications`, { params });
  }

  deleteNotification(id: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/admin/notifications/${id}`);
  }

  broadcast(title: string, message: string, type = 'ADMIN'): Observable<any> {
    return this.http.post(`${environment.apiUrl}/admin/notifications/broadcast`, { title, message, type });
  }

  // ---- System settings ----
  getSettings(): Observable<{ settings: AdminSystemSetting[] }> {
    return this.http.get<{ settings: AdminSystemSetting[] }>(`${environment.apiUrl}/admin/settings`);
  }

  updateSettings(settings: { key: string; value: string }[]): Observable<any> {
    return this.http.put(`${environment.apiUrl}/admin/settings`, { settings });
  }

  // ---- Audit log ----
  getAuditLog(page = 1, limit = 50): Observable<{ logs: AdminAuditEntry[]; total: number; page: number; limit: number }> {
    return this.http.get<any>(`${environment.apiUrl}/admin/audit-log`, { params: { page: String(page), limit: String(limit) } });
  }
}
