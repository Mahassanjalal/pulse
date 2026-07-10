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
  createdAt: string;
  role: string;
}

export interface AdminReport {
  id: string;
  category: string;
  description: string;
  status: string;
  createdAt: string;
  reporter: { id: string; username: string };
  reportedUser: { id: string; username: string };
}

export interface AdminStats {
  totalUsers: number;
  onlineUsers: number;
  todaySignups: number;
  totalMatches: number;
  pendingReports: number;
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  constructor(private http: HttpClient) {}

  listUsers(page = 1, limit = 50): Observable<{ users: AdminUser[]; total: number; page: number; limit: number }> {
    return this.http.get<any>(`${environment.apiUrl}/admin/users`, { params: { page: String(page), limit: String(limit) } });
  }

  setRole(userId: string, role: 'USER' | 'ADMIN' | 'MODERATOR'): Observable<{ user: AdminUser }> {
    return this.http.put<{ user: AdminUser }>(`${environment.apiUrl}/admin/users/${userId}/role`, { role });
  }

  setVerified(userId: string, isVerified: boolean): Observable<{ user: AdminUser }> {
    return this.http.put<{ user: AdminUser }>(`${environment.apiUrl}/admin/users/${userId}/verify`, { isVerified });
  }

  listReports(): Observable<{ reports: AdminReport[] }> {
    return this.http.get<{ reports: AdminReport[] }>(`${environment.apiUrl}/admin/reports`);
  }

  reviewReport(id: string): Observable<{ report: AdminReport }> {
    return this.http.post<{ report: AdminReport }>(`${environment.apiUrl}/admin/reports/${id}/review`, {});
  }

  resolveReport(id: string): Observable<{ report: AdminReport }> {
    return this.http.post<{ report: AdminReport }>(`${environment.apiUrl}/admin/reports/${id}/resolve`, {});
  }

  getStats(): Observable<AdminStats> {
    return this.http.get<AdminStats>(`${environment.apiUrl}/admin/stats`);
  }
}
