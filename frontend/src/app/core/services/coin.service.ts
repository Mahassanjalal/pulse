import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { CoinPackage, CoinTransaction } from '@models/user.model';

@Injectable({
  providedIn: 'root'
})
export class CoinService {
  constructor(private http: HttpClient) {}

  getPackages(): Observable<{ packages: CoinPackage[] }> {
    return this.http.get<{ packages: CoinPackage[] }>(`${environment.apiUrl}/coins/packages`);
  }

  /**
   * Create a Stripe one-time Checkout Session for coins and return a redirect
   * URL (or devMode direct grant). The caller should redirect to `url`.
   */
  createCheckout(packageId: string): Observable<{ sessionId?: string; url?: string; devMode?: boolean; coins?: number }> {
    return this.http.post<{ sessionId?: string; url?: string; devMode?: boolean; coins?: number }>(`${environment.apiUrl}/coins/create-checkout`, { packageId });
  }

  /**
   * Verify a completed coin purchase after returning from Stripe.
   */
  getCheckoutStatus(sessionId: string): Observable<{ devMode?: boolean; coins?: number; isPremium: boolean }> {
    return this.http.get<{ devMode?: boolean; coins?: number; isPremium: boolean }>(`${environment.apiUrl}/coins/checkout-status`, { params: { session_id: sessionId } });
  }

  getTransactions(): Observable<{ transactions: CoinTransaction[] }> {
    return this.http.get<{ transactions: CoinTransaction[] }>(`${environment.apiUrl}/coins/transactions`);
  }

  boost(): Observable<{ balance: number; boostedUntil: string }> {
    return this.http.post<{ balance: number; boostedUntil: string }>(`${environment.apiUrl}/coins/boost`, {});
  }

  superLike(userId: string): Observable<{ balance: number }> {
    return this.http.post<{ balance: number }>(`${environment.apiUrl}/coins/super-like`, { userId });
  }

  reMatch(matchId: string): Observable<{ balance: number; peerId: string }> {
    return this.http.post<{ balance: number; peerId: string }>(`${environment.apiUrl}/coins/re-match`, { matchId });
  }

  gift(toUserId: string, giftId: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/coins/gift`, { toUserId, giftId });
  }
}
