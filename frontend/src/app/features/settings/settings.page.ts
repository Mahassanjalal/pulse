import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'pulse-settings',
  templateUrl: './settings.page.html',
  styles: [`
    .settings-input {
      width: 100%;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 0.75rem;
      padding: 0.5rem 1rem;
      outline: none;
      transition: all 0.2s;
    }
    .settings-input:focus {
      border-color: var(--color-primary);
    }
  `]
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
  passwordForm!: FormGroup;
  toastMessage: string | null = null;
  private toastTimeout: any = null;
  showDeleteConfirm = false;
  private privacyDebounceTimers: Map<string, any> = new Map();

  constructor(
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    this.passwordForm = this.fb.group({
      current: ['', Validators.required],
      newPass: ['', [Validators.required, Validators.minLength(6)]],
      confirm: ['', Validators.required],
    }, { validators: this.passwordMatchValidator });

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

    this.userService.getSettings().subscribe({
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
      },
      error: () => this.showToast('Failed to load settings')
    });
  }

  passwordMatchValidator(group: FormGroup): { [key: string]: boolean } | null {
    const newPass = group.get('newPass')?.value;
    const confirm = group.get('confirm')?.value;
    return newPass && confirm && newPass !== confirm ? { passwordMismatch: true } : null;
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
    if (this.privacyDebounceTimers.has(key)) {
      clearTimeout(this.privacyDebounceTimers.get(key));
    }
    this.privacyDebounceTimers.set(key, setTimeout(() => {
      this.privacyDebounceTimers.delete(key);
      this.userService.updateSettings(this.privacySettings).subscribe({
        next: () => this.showToast('Privacy setting updated'),
        error: () => {
          this.privacySettings[key] = !this.privacySettings[key];
          this.showToast('Failed to update privacy setting');
        }
      });
    }, 500));
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

    this.userService.updateProfile(data).subscribe({
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
    this.userService.updatePreferences(this.preferences).subscribe({
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
    if (this.passwordForm.invalid) {
      Object.keys(this.passwordForm.controls).forEach(key => {
        this.passwordForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.userService.changePassword(this.passwordForm.value.current, this.passwordForm.value.newPass).subscribe({
      next: () => {
        this.showToast('Password changed successfully');
        this.passwordForm.reset();
      },
      error: () => this.showToast('Failed to change password. Check your current password.')
    });
  }

  openDeleteConfirm(): void {
    this.showDeleteConfirm = true;
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  deleteAccount(): void {
    this.showDeleteConfirm = false;
    this.userService.deleteAccount().subscribe({
      next: () => this.authService.logout(),
      error: () => this.showToast('Failed to deactivate account')
    });
  }
}
