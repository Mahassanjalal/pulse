import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, take, switchMap } from 'rxjs/operators';
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
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return new Observable<HttpEvent<any>>(observer => {
        (async () => {
          try {
            const newToken = await (this as any).authService.refreshToken();
            if (newToken) {
              this.refreshTokenSubject.next(newToken);
              const cloned = this.addToken(request, newToken);
              next.handle(cloned).subscribe(observer);
            } else {
              this.refreshTokenSubject.error('Token refresh failed');
              observer.error(new HttpErrorResponse({ status: 401 }));
            }
          } catch {
            this.refreshTokenSubject.error('Token refresh failed');
            observer.error(new HttpErrorResponse({ status: 401 }));
          } finally {
            this.isRefreshing = false;
          }
        })();
      });
    }

    return this.refreshTokenSubject.pipe(
      filter(token => token !== null),
      take(1),
      switchMap(token => {
        const cloned = this.addToken(request, token!);
        return next.handle(cloned);
      })
    );
  }

  constructor(private authService: AuthService) {}
}
