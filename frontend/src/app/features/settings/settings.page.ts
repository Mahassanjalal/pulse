import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '@env/environment';

@Component({
  selector: 'pulse-settings',
  template: `
    <div class="p-lg md:p-xl max-w-5xl mx-auto">
      <div class="mb-xl">
        <h1 class="font-headline-lg text-headline-lg mb-xs">Settings & Preferences</h1>
        <p class="text-on-surface-variant">Customize your global discovery experience and account security.</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg">
        <!-- Main Column -->
        <section class="lg:col-span-8 space-y-lg">
          <!-- Account Section -->
          <div class="glass-panel rounded-3xl p-lg border border-white/10">
            <div class="flex items-center gap-md mb-lg">
              <span class="material-symbols-outlined text-primary">account_circle</span>
              <h2 class="font-headline-md text-headline-md">Account Settings</h2>
            </div>
            <div class="space-y-lg">
              <div class="flex flex-col md:flex-row gap-lg items-start md:items-center">
                <div class="relative group">
                  <div class="w-24 h-24 rounded-2xl overflow-hidden border border-white/10">
                    <img class="w-full h-full object-cover" [src]="user?.profilePicture || 'https://i.pravatar.cc/200?img=1'" alt="" />
                  </div>
                </div>
                <div class="flex-1 space-y-md w-full">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
                    <div class="space-y-xs">
                      <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Display Name</label>
                      <input [(ngModel)]="displayName" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" type="text" />
                    </div>
                    <div class="space-y-xs">
                      <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Email Address</label>
                      <input [value]="user?.email" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" type="email" disabled />
                    </div>
                  </div>
                  <button (click)="saveProfile()" class="px-lg py-sm bg-primary text-on-primary rounded-xl font-label text-label-md hover:brightness-110 active:scale-95 transition-all">Save Changes</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Privacy Section -->
          <div class="glass-panel rounded-3xl p-lg border border-white/10 overflow-hidden relative">
            <div class="absolute -right-12 -top-12 w-32 h-32 bg-tertiary/10 blur-3xl rounded-full"></div>
            <div class="flex items-center gap-md mb-lg">
              <span class="material-symbols-outlined text-tertiary-fixed">verified_user</span>
              <h2 class="font-headline-md text-headline-md">Privacy</h2>
            </div>
            <div class="space-y-lg">
              <div class="p-md rounded-2xl bg-tertiary-container/10 border border-tertiary/20 flex items-center justify-between">
                <div>
                  <p class="text-xs font-bold text-tertiary-fixed uppercase">Trust Score</p>
                  <h3 class="text-xl font-bold text-tertiary-fixed">{{ user?.trustScore || 0 }}% Excellent</h3>
                </div>
                <span class="material-symbols-outlined text-3xl text-tertiary-fixed">verified</span>
              </div>
              <ul class="space-y-md">
                <li class="flex items-center justify-between text-sm">
                  <span class="text-on-surface-variant">Hide Age</span>
                  <button class="w-10 h-5 rounded-full relative transition-all" [class]="privacySettings?.hideAge ? 'bg-tertiary' : 'bg-white/10'" (click)="togglePrivacy('hideAge')">
                    <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="privacySettings?.hideAge ? 'right-1 bg-white ml-auto mr-1' : 'left-1 bg-on-surface-variant'"></div>
                  </button>
                </li>
                <li class="flex items-center justify-between text-sm">
                  <span class="text-on-surface-variant">Hide Country</span>
                  <button class="w-10 h-5 rounded-full relative transition-all" [class]="privacySettings?.hideCountry ? 'bg-tertiary' : 'bg-white/10'" (click)="togglePrivacy('hideCountry')">
                    <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="privacySettings?.hideCountry ? 'right-1 bg-white ml-auto mr-1' : 'left-1 bg-on-surface-variant'"></div>
                  </button>
                </li>
                <li class="flex items-center justify-between text-sm">
                  <span class="text-on-surface-variant">Hide Online Status</span>
                  <button class="w-10 h-5 rounded-full relative transition-all" [class]="privacySettings?.hideOnlineStatus ? 'bg-tertiary' : 'bg-white/10'" (click)="togglePrivacy('hideOnlineStatus')">
                    <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="privacySettings?.hideOnlineStatus ? 'right-1 bg-white ml-auto mr-1' : 'left-1 bg-on-surface-variant'"></div>
                  </button>
                </li>
                <li class="flex items-center justify-between text-sm">
                  <span class="text-on-surface-variant">Private Profile</span>
                  <button class="w-10 h-5 rounded-full relative transition-all" [class]="privacySettings?.privateProfile ? 'bg-tertiary' : 'bg-white/10'" (click)="togglePrivacy('privateProfile')">
                    <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="privacySettings?.privateProfile ? 'right-1 bg-white ml-auto mr-1' : 'left-1 bg-on-surface-variant'"></div>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <!-- Sidebar -->
        <aside class="lg:col-span-4 space-y-lg">
          <!-- Matching Preferences -->
          <div class="glass-panel rounded-3xl p-lg border border-white/10">
            <div class="flex items-center gap-md mb-lg">
              <span class="material-symbols-outlined text-primary">tune</span>
              <h2 class="font-headline-md text-headline-md">Matching Preferences</h2>
            </div>
            <div class="space-y-lg">
              <div class="space-y-xs">
                <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Gender Preference</label>
                <select [(ngModel)]="preferences.genderPreference" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none appearance-none cursor-pointer">
                  <option class="bg-surface" value="">Everyone</option>
                  <option class="bg-surface" value="MALE">Male</option>
                  <option class="bg-surface" value="FEMALE">Female</option>
                  <option class="bg-surface" value="NON_BINARY">Non-Binary</option>
                </select>
              </div>
              <div class="space-y-xs">
                <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Age Range</label>
                <div class="flex items-center gap-sm">
                  <input [(ngModel)]="preferences.ageRangeMin" type="number" min="18" max="99" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none" />
                  <span class="text-on-surface-variant">to</span>
                  <input [(ngModel)]="preferences.ageRangeMax" type="number" min="18" max="99" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none" />
                </div>
              </div>
              <div class="flex items-center justify-between">
                <label class="text-sm">Verified Only</label>
                <button class="w-10 h-5 rounded-full relative transition-all" [class]="preferences.verifiedOnly ? 'bg-tertiary' : 'bg-white/10'" (click)="preferences.verifiedOnly = !preferences.verifiedOnly">
                  <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="preferences.verifiedOnly ? 'right-1 bg-white ml-auto mr-1' : 'left-1 bg-on-surface-variant'"></div>
                </button>
              </div>
              <button (click)="savePreferences()" class="w-full py-md bg-primary text-on-primary rounded-xl font-label text-label-md neon-glow-primary hover:brightness-110 active:scale-95 transition-all">Save Preferences</button>
            </div>
          </div>
        </aside>
      </div>

      <div class="mt-xl pt-xl border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-lg">
        <div class="flex gap-lg">
          <a class="text-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Privacy Policy</a>
          <a class="text-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Terms of Service</a>
        </div>
        <button (click)="deleteAccount()" class="text-error-container hover:text-error text-sm font-bold transition-colors">Deactivate Account</button>
      </div>
    </div>
  `,
  styles: []
})
export class SettingsPageComponent implements OnInit {
  user: any = null;
  displayName = '';
  privacySettings: any = {};
  preferences: any = {
    genderPreference: '',
    ageRangeMin: 18,
    ageRangeMax: 99,
    verifiedOnly: false,
  };
  saved = false;

  constructor(private http: HttpClient, private authService: AuthService) {}

  ngOnInit(): void {
    this.authService.user$.subscribe(user => {
      if (user) {
        this.user = user;
        this.displayName = user.displayName || '';
      }
    });

    this.http.get<{ settings: any; preferences: any }>(`${environment.apiUrl}/users/me/settings`).subscribe({
      next: (res) => {
        if (res.settings) this.privacySettings = res.settings;
        if (res.preferences) {
          this.preferences = {
            genderPreference: res.preferences.genderPreference || '',
            ageRangeMin: res.preferences.ageRangeMin || 18,
            ageRangeMax: res.preferences.ageRangeMax || 99,
            verifiedOnly: res.preferences.verifiedOnly || false,
          };
        }
      }
    });
  }

  togglePrivacy(key: string): void {
    this.privacySettings[key] = !this.privacySettings[key];
    this.http.put(`${environment.apiUrl}/users/me/settings`, { [key]: this.privacySettings[key] }).subscribe();
  }

  saveProfile(): void {
    this.http.patch(`${environment.apiUrl}/users/me/profile`, { displayName: this.displayName }).subscribe({
      next: () => {
        this.authService.fetchCurrentUser().subscribe();
      }
    });
  }

  savePreferences(): void {
    this.http.put(`${environment.apiUrl}/users/me/preferences`, this.preferences).subscribe();
  }

  deleteAccount(): void {
    if (confirm('Are you sure you want to deactivate your account? This action cannot be undone.')) {
      this.http.delete(`${environment.apiUrl}/auth/account`).subscribe({
        next: () => this.authService.logout()
      });
    }
  }
}
