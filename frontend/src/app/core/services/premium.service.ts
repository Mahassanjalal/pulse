import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

export interface Plan {
  id: string;
  name: string;
  price: number;
  period: string;
  features: string[];
  popular: boolean;
}

export interface SubscriptionInfo {
  id: string;
  planType: string;
  price: number;
  period: string;
  features: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PremiumService {
  constructor(private http: HttpClient) {}

  getPlans(): Observable<{ plans: Plan[] }> {
    return this.http.get<{ plans: Plan[] }>(`${environment.apiUrl}/premium/plans`);
  }

  getSubscription(): Observable<{ subscription: SubscriptionInfo | null }> {
    return this.http.get<{ subscription: SubscriptionInfo | null }>(`${environment.apiUrl}/premium/subscription`);
  }

  subscribe(planId: string, period = 'monthly'): Observable<{ subscription: SubscriptionInfo }> {
    return this.http.post<{ subscription: SubscriptionInfo }>(`${environment.apiUrl}/premium/subscribe`, { planId, period });
  }

  cancel(): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${environment.apiUrl}/premium/cancel`, {});
  }
}
