import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, take, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = localStorage.getItem('token');

    if (token) {
      req = this.addToken(req, token);
    }

    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && !req.url.includes('/auth/refresh') && !req.url.includes('/auth/login')) {
          return this.handle401Error(req, next);
        }
        return throwError(() => error);
      })
    );
  }

  private addToken(request: HttpRequest<any>, token: string): HttpRequest<any> {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  private handle401Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // No refresh token (e.g. guest, expired session) -> kill the session.
    if (!localStorage.getItem('refreshToken')) {
      this.authService.forceLogout();
      this.router.navigate(['/login']);
      return throwError(() => new HttpErrorResponse({ status: 401 }));
    }

    if (!this.isRefreshing) {
      this.isRefreshing = true;
      // Fresh subject per cycle so a previous error can't poison future refreshes.
      this.refreshTokenSubject = new BehaviorSubject<string | null>(null);

      (async () => {
        try {
          const newToken = await this.authService.refreshToken();
          if (newToken) {
            this.refreshTokenSubject.next(newToken);
          } else {
            throw new Error('refresh failed');
          }
        } catch {
          this.authService.forceLogout();
          this.router.navigate(['/login']);
          this.refreshTokenSubject.error('Token refresh failed');
        } finally {
          this.isRefreshing = false;
        }
      })();
    }

    return this.refreshTokenSubject.pipe(
      filter(token => token !== null),
      take(1),
      switchMap(token => next.handle(this.addToken(request, token!)))
    );
  }

  constructor(private authService: AuthService, private router: Router) {}
}
