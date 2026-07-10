import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { Observable } from 'rxjs';
import { filter, take, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(): Observable<boolean> {
    return this.authService.loading$.pipe(
      filter(loading => !loading),
      take(1),
      map(() => {
        if (this.authService.isAuthenticated()) {
          return true;
        }
        this.router.navigate(['/login']);
        return false;
      })
    );
  }
}

@Injectable({
  providedIn: 'root'
})
export class GuestGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(): Observable<boolean> {
    return this.authService.loading$.pipe(
      filter(loading => !loading),
      take(1),
      map(() => {
        if (!this.authService.isAuthenticated()) {
          return true;
        }
        this.router.navigate(['/dashboard']);
        return false;
      })
    );
  }
}

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(): boolean {
    const user = this.authService.getCurrentUser();
    if (user && (user.role === 'ADMIN' || user.role === 'MODERATOR')) {
      return true;
    }
    this.router.navigate(['/dashboard']);
    return false;
  }
}
