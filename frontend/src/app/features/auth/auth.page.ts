import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '@env/environment';

declare const google: any;

@Component({
  selector: 'pulse-auth',
  templateUrl: './auth.page.html',
  styleUrls: ['./auth.page.scss']
})
export class AuthPageComponent implements OnInit {
  mode: 'login' | 'register' = 'login';
  email = '';
  password = '';
  displayName = '';
  username = '';
  loading = false;
  error = '';

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.loadGsiScript();
  }

  private loadGsiScript(): void {
    if (typeof google !== 'undefined') return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }

  async signInWithGoogle(): Promise<void> {
    this.error = '';
    const client = google.accounts.oauth2.initTokenClient({
      client_id: environment.googleClientId,
      scope: 'openid email profile',
      callback: async (response: any) => {
        if (response.credential) {
          await this.handleGoogleCredential(response.credential);
        }
      },
    });
    client.requestAccessToken();
  }

  private async handleGoogleCredential(credential: string): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      await this.authService.loginWithGoogle(credential);
      this.router.navigate(['/dashboard']);
    } catch (err: any) {
      this.error = err?.error?.error || err?.message || 'Google sign-in failed';
    } finally {
      this.loading = false;
    }
  }

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
