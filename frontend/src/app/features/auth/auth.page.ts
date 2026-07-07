import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'pulse-auth',
  templateUrl: './auth.page.html',
  styleUrls: ['./auth.page.scss']
})
export class AuthPageComponent {
  mode: 'login' | 'register' = 'login';
  email = '';
  password = '';
  displayName = '';
  username = '';
  loading = false;
  error = '';

  constructor(private authService: AuthService, private router: Router) {}

  async onSubmit(): Promise<void> {
    this.error = '';
    this.loading = true;

    try {
      if (this.mode === 'login') {
        await this.authService.login(this.email, this.password);
      } else {
        await this.authService.register({
          email: this.email,
          username: this.username || this.email.split('@')[0],
          displayName: this.displayName,
          password: this.password,
        });
      }
      this.router.navigate(['/dashboard']);
    } catch (err: any) {
      this.error = err?.error?.error || err?.message || 'An error occurred';
    } finally {
      this.loading = false;
    }
  }
}
