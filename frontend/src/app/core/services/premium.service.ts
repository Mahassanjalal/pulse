import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { PremiumPlan, SubscriptionInfo } from '@models/user.model';

@Injectable({
  providedIn: 'root'
})
export class PremiumService {
  constructor(private http: HttpClient) {}

  getPlans(): Observable<{ plans: PremiumPlan[] }> {
    return this.http.get<{ plans: PremiumPlan[] }>(`${environment.apiUrl}/premium/plans`);
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
