import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
  authForm!: FormGroup;
  loading = false;
  error = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadGsiScript();
  }

  private initForm(): void {
    this.authForm = this.fb.group({
      displayName: [''],
      username: [''],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(128)]],
    });
    this.applyModeValidators();
  }

  switchMode(mode: 'login' | 'register'): void {
    this.mode = mode;
    this.error = '';
    this.applyModeValidators();
  }

  private applyModeValidators(): void {
    const nameValidators = this.mode === 'register'
      ? [Validators.required, Validators.minLength(2), Validators.maxLength(50)]
      : null;
    const userValidators = this.mode === 'register'
      ? [Validators.required, Validators.minLength(3), Validators.maxLength(30), Validators.pattern(/^[a-zA-Z0-9_]+$/)]
      : null;

    const displayName = this.authForm.get('displayName');
    const username = this.authForm.get('username');
    if (nameValidators) {
      displayName?.setValidators(nameValidators);
    } else {
      displayName?.clearValidators();
    }
    if (userValidators) {
      username?.setValidators(userValidators);
    } else {
      username?.clearValidators();
    }
    displayName?.updateValueAndValidity({ emitEvent: false });
    username?.updateValueAndValidity({ emitEvent: false });
  }

  private loadGsiScript(): void {
    if (typeof google !== 'undefined') {
      this.initGoogleSignIn();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => this.initGoogleSignIn();
    document.body.appendChild(script);
  }

  private initGoogleSignIn(): void {
    if (typeof google === 'undefined') return;
    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response: any) => {
        if (response?.credential) {
          this.handleGoogleCredential(response.credential);
        }
      },
    });
  }

  signInWithGoogle(): void {
    this.error = '';
    if (typeof google === 'undefined') {
      this.error = 'Google sign-in is unavailable. Please try again in a moment.';
      return;
    }
    google.accounts.id.prompt((notification: any) => {
      if (notification?.isNotDisplayed() || notification?.isSkippedMoment?.()) {
        this.error = 'Google sign-in was cancelled or blocked by your browser.';
      }
    });
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

  get f() {
    return this.authForm.controls;
  }

  async onSubmit(): Promise<void> {
    this.error = '';

    if (this.authForm.invalid) {
      Object.keys(this.authForm.controls).forEach(key => {
        this.authForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.loading = true;

    try {
      if (this.mode === 'login') {
        await this.authService.login(this.authForm.value.email, this.authForm.value.password);
      } else {
        await this.authService.register({
          email: this.authForm.value.email,
          username: this.authForm.value.username || this.authForm.value.email.split('@')[0],
          displayName: this.authForm.value.displayName,
          password: this.authForm.value.password,
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
