import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
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

      <!-- Toast -->
      <div *ngIf="toastMessage" class="fixed top-20 right-lg z-50 bg-surface/90 backdrop-blur-md border border-white/10 px-lg py-md rounded-xl shadow-2xl animate-fade-in">
        <p class="font-label text-label-md text-on-surface">{{ toastMessage }}</p>
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
              <div class="flex flex-col md:flex-row gap-lg items-start">
                <div class="relative group shrink-0">
                  <div class="w-24 h-24 rounded-2xl overflow-hidden border border-white/10">
                    <img class="w-full h-full object-cover" [src]="profilePicture || 'https://i.pravatar.cc/200?img=1'" alt="" />
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
                      <input [value]="user?.email" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm outline-none transition-all opacity-60" type="email" disabled />
                    </div>
                    <div class="space-y-xs">
                      <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Age</label>
                      <input [(ngModel)]="editAge" type="number" min="13" max="120" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none transition-all" />
                    </div>
                    <div class="space-y-xs">
                      <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Gender</label>
                      <select [(ngModel)]="editGender" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none appearance-none cursor-pointer">
                        <option class="bg-surface" value="">Prefer not to say</option>
                        <option class="bg-surface" value="MALE">Male</option>
                        <option class="bg-surface" value="FEMALE">Female</option>
                        <option class="bg-surface" value="NON_BINARY">Non-Binary</option>
                      </select>
                    </div>
                    <div class="space-y-xs">
                      <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Country</label>
                      <input [(ngModel)]="editCountry" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none transition-all" type="text" />
                    </div>
                    <div class="space-y-xs">
                      <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Languages</label>
                      <input [(ngModel)]="editLanguages" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none transition-all" placeholder="e.g. EN, ES, FR" type="text" />
                    </div>
                  </div>
                    <div class="space-y-xs">
                      <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Profile Picture URL</label>
                      <input [(ngModel)]="profilePicture" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none transition-all" type="text" placeholder="https://..." />
                    </div>
                    <div class="space-y-xs">
                      <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Cover Image URL</label>
                      <input [(ngModel)]="coverImage" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none transition-all" type="text" placeholder="https://..." />
                    </div>
                    <div class="space-y-xs">
                      <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Interests (comma-separated)</label>
                      <input [(ngModel)]="editInterests" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none transition-all" placeholder="e.g. Music, Design, Gaming" type="text" />
                    </div>
                  <div class="space-y-xs">
                    <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Bio</label>
                    <textarea [(ngModel)]="editBio" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none transition-all" rows="3" maxlength="500" placeholder="Tell people about yourself..."></textarea>
                    <p class="text-xs text-on-surface-variant">{{ (editBio || '').length }}/500</p>
                  </div>
                  <button (click)="saveProfile()" [disabled]="savingProfile" class="px-lg py-sm bg-primary text-on-primary rounded-xl font-label text-label-md hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-sm">
                    <span *ngIf="savingProfile" class="material-symbols-outlined animate-spin text-sm">sync</span>
                    {{ savingProfile ? 'Saving...' : 'Save Changes' }}
                  </button>
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
                  <h3 class="text-xl font-bold" [class]="trustScoreLabel.color">{{ user?.trustScore || 0 }}% {{ trustScoreLabel.text }}</h3>
                </div>
                <span class="material-symbols-outlined text-3xl text-tertiary-fixed">verified</span>
              </div>
              <ul class="space-y-md">
                <li class="flex items-center justify-between text-sm">
                  <span class="text-on-surface-variant">Hide Age</span>
                  <button class="w-10 h-5 rounded-full relative transition-all cursor-pointer" [class]="privacySettings?.hideAge ? 'bg-tertiary' : 'bg-white/10'" (click)="togglePrivacy('hideAge')">
                    <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="privacySettings?.hideAge ? 'right-1 bg-white' : 'left-1 bg-on-surface-variant'"></div>
                  </button>
                </li>
                <li class="flex items-center justify-between text-sm">
                  <span class="text-on-surface-variant">Hide Country</span>
                  <button class="w-10 h-5 rounded-full relative transition-all cursor-pointer" [class]="privacySettings?.hideCountry ? 'bg-tertiary' : 'bg-white/10'" (click)="togglePrivacy('hideCountry')">
                    <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="privacySettings?.hideCountry ? 'right-1 bg-white' : 'left-1 bg-on-surface-variant'"></div>
                  </button>
                </li>
                <li class="flex items-center justify-between text-sm">
                  <span class="text-on-surface-variant">Hide Online Status</span>
                  <button class="w-10 h-5 rounded-full relative transition-all cursor-pointer" [class]="privacySettings?.hideOnlineStatus ? 'bg-tertiary' : 'bg-white/10'" (click)="togglePrivacy('hideOnlineStatus')">
                    <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="privacySettings?.hideOnlineStatus ? 'right-1 bg-white' : 'left-1 bg-on-surface-variant'"></div>
                  </button>
                </li>
                <li class="flex items-center justify-between text-sm">
                  <span class="text-on-surface-variant">Hide Profile Picture</span>
                  <button class="w-10 h-5 rounded-full relative transition-all cursor-pointer" [class]="privacySettings?.hideProfilePicture ? 'bg-tertiary' : 'bg-white/10'" (click)="togglePrivacy('hideProfilePicture')">
                    <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="privacySettings?.hideProfilePicture ? 'right-1 bg-white' : 'left-1 bg-on-surface-variant'"></div>
                  </button>
                </li>
                <li class="flex items-center justify-between text-sm">
                  <span class="text-on-surface-variant">Private Profile</span>
                  <button class="w-10 h-5 rounded-full relative transition-all cursor-pointer" [class]="privacySettings?.privateProfile ? 'bg-tertiary' : 'bg-white/10'" (click)="togglePrivacy('privateProfile')">
                    <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="privacySettings?.privateProfile ? 'right-1 bg-white' : 'left-1 bg-on-surface-variant'"></div>
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <!-- Change Password -->
          <div class="glass-panel rounded-3xl p-lg border border-white/10">
            <div class="flex items-center gap-md mb-lg">
              <span class="material-symbols-outlined text-primary">lock</span>
              <h2 class="font-headline-md text-headline-md">Change Password</h2>
            </div>
            <div class="space-y-md max-w-md">
              <div class="space-y-xs">
                <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Current Password</label>
                <input [(ngModel)]="passwordData.current" type="password" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none transition-all" />
              </div>
              <div class="space-y-xs">
                <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">New Password</label>
                <input [(ngModel)]="passwordData.newPass" type="password" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none transition-all" />
              </div>
              <div class="space-y-xs">
                <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Confirm New Password</label>
                <input [(ngModel)]="passwordData.confirm" type="password" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none transition-all" />
              </div>
              <button (click)="changePassword()" class="px-lg py-sm bg-primary text-on-primary rounded-xl font-label text-label-md hover:brightness-110 active:scale-95 transition-all">Update Password</button>
            </div>
          </div>
        </section>

        <!-- Sidebar -->
        <aside class="lg:col-span-4 space-y-lg">
          <!-- Balance -->
          <div class="glass-panel rounded-3xl p-lg border border-white/10">
            <div class="flex items-center gap-md mb-lg">
              <span class="material-symbols-outlined text-primary" style="font-variation-settings: 'FILL' 1;">account_balance_wallet</span>
              <h2 class="font-headline-md text-headline-md">Balance</h2>
            </div>
            <div class="flex items-center justify-between">
              <p class="text-on-surface-variant text-sm">Gems</p>
              <p class="font-headline-lg text-headline-lg text-primary">{{ user?.coins || 0 }}</p>
            </div>
          </div>

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
                <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Country Preference</label>
                <input [(ngModel)]="preferences.countryPreference" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none" placeholder="Leave empty for global" />
              </div>
              <div class="space-y-xs">
                <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Language Preference</label>
                <input [(ngModel)]="preferences.languagePreference" class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary outline-none" placeholder="e.g. EN" />
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
                <label class="text-sm text-on-surface-variant">Interests Match</label>
                <button class="w-10 h-5 rounded-full relative transition-all cursor-pointer" [class]="preferences.interestsMatch ? 'bg-tertiary' : 'bg-white/10'" (click)="preferences.interestsMatch = !preferences.interestsMatch">
                  <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="preferences.interestsMatch ? 'right-1 bg-white' : 'left-1 bg-on-surface-variant'"></div>
                </button>
              </div>
              <div class="flex items-center justify-between">
                <label class="text-sm text-on-surface-variant">Verified Only</label>
                <button class="w-10 h-5 rounded-full relative transition-all cursor-pointer" [class]="preferences.verifiedOnly ? 'bg-tertiary' : 'bg-white/10'" (click)="preferences.verifiedOnly = !preferences.verifiedOnly">
                  <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="preferences.verifiedOnly ? 'right-1 bg-white' : 'left-1 bg-on-surface-variant'"></div>
                </button>
              </div>
              <div class="flex items-center justify-between">
                <label class="text-sm text-on-surface-variant">Premium Only</label>
                <button class="w-10 h-5 rounded-full relative transition-all cursor-pointer" [class]="preferences.premiumOnly ? 'bg-tertiary' : 'bg-white/10'" (click)="preferences.premiumOnly = !preferences.premiumOnly">
                  <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="preferences.premiumOnly ? 'right-1 bg-white' : 'left-1 bg-on-surface-variant'"></div>
                </button>
              </div>
              <div class="flex items-center justify-between">
                <label class="text-sm text-on-surface-variant">Invisible Mode</label>
                <button class="w-10 h-5 rounded-full relative transition-all cursor-pointer" [class]="preferences.invisibleMode ? 'bg-tertiary' : 'bg-white/10'" (click)="preferences.invisibleMode = !preferences.invisibleMode">
                  <div class="absolute top-1 w-3 h-3 rounded-full transition-all" [class]="preferences.invisibleMode ? 'right-1 bg-white' : 'left-1 bg-on-surface-variant'"></div>
                </button>
              </div>
              <button (click)="savePreferences()" [disabled]="savingPreferences" class="w-full py-md bg-primary text-on-primary rounded-xl font-label text-label-md neon-glow-primary hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-sm">
                <span *ngIf="savingPreferences" class="material-symbols-outlined animate-spin text-sm">sync</span>
                {{ savingPreferences ? 'Saving...' : 'Save Preferences' }}
              </button>
            </div>
          </div>
        </aside>
      </div>

      <div class="mt-xl pt-xl border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-lg">
        <div class="flex gap-lg">
          <a class="text-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Privacy Policy</a>
          <a class="text-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Terms of Service</a>
        </div>
        <div class="flex gap-lg items-center">
          <button (click)="logout()" class="text-primary hover:text-error text-sm font-bold transition-colors">Sign Out</button>
          <span class="text-on-surface-variant/30">|</span>
          <button (click)="deleteAccount()" class="text-error-container hover:text-error text-sm font-bold transition-colors">Deactivate Account</button>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class SettingsPageComponent implements OnInit {
  user: any = null;
  displayName = '';
  editBio = '';
  editAge: number | null = null;
  editGender = '';
  editCountry = '';
  editLanguages = '';
  editInterests = '';
  profilePicture = '';
  coverImage = '';
  savingProfile = false;
  savingPreferences = false;
  privacySettings: any = {};
  preferences: any = {
    genderPreference: '',
    countryPreference: '',
    languagePreference: '',
    ageRangeMin: 18,
    ageRangeMax: 99,
    interestsMatch: true,
    verifiedOnly: false,
    premiumOnly: false,
    invisibleMode: false,
  };
  passwordData = { current: '', newPass: '', confirm: '' };
  toastMessage: string | null = null;
  private toastTimeout: any = null;

  constructor(private http: HttpClient, private authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.authService.user$.subscribe(user => {
      if (user) {
        this.user = user;
        this.displayName = user.displayName || '';
        this.editBio = user.bio || '';
        this.editAge = user.age || null;
        this.editGender = user.gender || '';
        this.editCountry = user.country || '';
        this.editLanguages = Array.isArray(user.languages) ? user.languages.join(', ') : user.languages || '';
        this.editInterests = Array.isArray(user.interests) ? user.interests.join(', ') : user.interests || '';
        this.profilePicture = user.profilePicture || '';
        this.coverImage = user.coverImage || '';
      }
    });

    this.http.get<{ settings: any; preferences: any }>(`${environment.apiUrl}/users/me/settings`).subscribe({
      next: (res) => {
        if (res.settings) this.privacySettings = res.settings;
        if (res.preferences) {
          this.preferences = {
            genderPreference: res.preferences.genderPreference || '',
            countryPreference: res.preferences.countryPreference || '',
            languagePreference: res.preferences.languagePreference || '',
            ageRangeMin: res.preferences.ageRangeMin || 18,
            ageRangeMax: res.preferences.ageRangeMax || 99,
            interestsMatch: res.preferences.interestsMatch ?? true,
            verifiedOnly: res.preferences.verifiedOnly || false,
            premiumOnly: res.preferences.premiumOnly || false,
            invisibleMode: res.preferences.invisibleMode || false,
          };
        }
      }
    });
  }

  get trustScoreLabel(): { text: string; color: string } {
    const score = this.user?.trustScore || 0;
    if (score >= 80) return { text: 'Excellent', color: 'text-tertiary-fixed' };
    if (score >= 60) return { text: 'Good', color: 'text-tertiary' };
    if (score >= 40) return { text: 'Fair', color: 'text-yellow-400' };
    return { text: 'Needs Improvement', color: 'text-error' };
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toastMessage = null, 3000);
  }

  togglePrivacy(key: string): void {
    this.privacySettings[key] = !this.privacySettings[key];
    this.http.put(`${environment.apiUrl}/users/me/settings`, this.privacySettings).subscribe({
      next: () => this.showToast('Privacy setting updated'),
    });
  }

  saveProfile(): void {
    this.savingProfile = true;
    const data: any = { displayName: this.displayName };
    if (this.editBio !== undefined) data.bio = this.editBio;
    if (this.editAge !== null) data.age = this.editAge;
    if (this.editGender) data.gender = this.editGender;
    if (this.editCountry) data.country = this.editCountry;
    if (this.editLanguages) data.languages = this.editLanguages;
    if (this.editInterests) data.interests = this.editInterests;
    if (this.profilePicture) data.profilePicture = this.profilePicture;
    if (this.coverImage) data.coverImage = this.coverImage;

    this.http.patch(`${environment.apiUrl}/users/me/profile`, data).subscribe({
      next: () => {
        this.authService.fetchCurrentUser().subscribe();
        this.showToast('Profile saved successfully');
        this.savingProfile = false;
      },
      error: () => {
        this.showToast('Failed to save profile');
        this.savingProfile = false;
      }
    });
  }

  savePreferences(): void {
    this.savingPreferences = true;
    this.http.put(`${environment.apiUrl}/users/me/preferences`, this.preferences).subscribe({
      next: () => {
        this.showToast('Preferences saved');
        this.savingPreferences = false;
      },
      error: () => {
        this.showToast('Failed to save preferences');
        this.savingPreferences = false;
      }
    });
  }

  changePassword(): void {
    if (!this.passwordData.current || !this.passwordData.newPass) {
      this.showToast('Please fill in both password fields');
      return;
    }
    if (this.passwordData.newPass !== this.passwordData.confirm) {
      this.showToast('New passwords do not match');
      return;
    }
    if (this.passwordData.newPass.length < 6) {
      this.showToast('Password must be at least 6 characters');
      return;
    }
    this.http.post(`${environment.apiUrl}/auth/change-password`, {
      currentPassword: this.passwordData.current,
      newPassword: this.passwordData.newPass,
    }).subscribe({
      next: () => {
        this.showToast('Password changed successfully');
        this.passwordData = { current: '', newPass: '', confirm: '' };
      },
      error: () => this.showToast('Failed to change password. Check your current password.')
    });
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  deleteAccount(): void {
    if (confirm('Are you sure you want to deactivate your account? This action cannot be undone.')) {
      this.http.delete(`${environment.apiUrl}/auth/account`).subscribe({
        next: () => this.authService.logout()
      });
    }
  }
}
