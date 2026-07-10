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

  /**
   * Create a Stripe Checkout Session and return a redirect URL (or devMode
   * grant). The caller should redirect the browser to `url`.
   */
  createCheckout(planId: string, period = 'monthly'): Observable<{ sessionId?: string; url?: string; devMode?: boolean; subscription?: SubscriptionInfo }> {
    return this.http.post(`${environment.apiUrl}/premium/create-checkout`, { planId, period });
  }

  /**
   * Verify a completed Checkout Session after returning from Stripe and grant
   * premium if the payment succeeded.
   */
  getCheckoutStatus(sessionId: string): Observable<{ devMode?: boolean; isPremium: boolean; premiumUntil?: string }> {
    return this.http.get<{ devMode?: boolean; isPremium: boolean; premiumUntil?: string }>(`${environment.apiUrl}/premium/checkout-status`, { params: { session_id: sessionId } });
  }

  cancel(): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${environment.apiUrl}/premium/cancel`, {});
  }
}
