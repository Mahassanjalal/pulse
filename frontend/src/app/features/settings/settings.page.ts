import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';

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
                    <img class="w-full h-full object-cover" src="https://i.pravatar.cc/200?img=1" alt="" />
                  </div>
                  <button class="absolute -bottom-2 -right-2 bg-secondary-fixed text-on-secondary-fixed w-8 h-8 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                    <span class="material-symbols-outlined text-sm">edit</span>
                  </button>
                </div>
                <div class="flex-1 space-y-md w-full">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
                    <div class="space-y-xs">
                      <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Display Name</label>
                      <input class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" type="text" value="Julian_Vibe" />
                    </div>
                    <div class="space-y-xs">
                      <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Email Address</label>
                      <input class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" type="email" value="julian@pulse-discovery.com" />
                    </div>
                  </div>
                </div>
              </div>
              <div class="pt-md border-t border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-md">
                <div>
                  <h4 class="font-bold">Password</h4>
                  <p class="text-sm text-on-surface-variant">Last changed 3 months ago</p>
                </div>
                <button class="px-lg py-sm border border-white/20 rounded-xl hover:bg-white/5 transition-all">Change Password</button>
              </div>
            </div>
          </div>

          <!-- Video & Audio Section -->
          <div class="glass-panel rounded-3xl p-lg border border-white/10">
            <div class="flex items-center gap-md mb-lg">
              <span class="material-symbols-outlined text-secondary-fixed">videocam</span>
              <h2 class="font-headline-md text-headline-md">Video & Audio</h2>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-xl">
              <div class="space-y-lg">
                <div class="space-y-xs">
                  <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Camera Input</label>
                  <select class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-secondary-fixed focus:ring-1 focus:ring-secondary-fixed outline-none appearance-none cursor-pointer">
                    <option class="bg-surface">Integrated FaceTime HD Camera</option>
                    <option class="bg-surface">Logitech Brio 4K</option>
                    <option class="bg-surface">OBS Virtual Camera</option>
                  </select>
                </div>
                <div class="space-y-md">
                  <div class="flex items-center justify-between">
                    <label class="text-sm">Background Blur</label>
                    <button class="w-12 h-6 bg-primary rounded-full relative transition-all shadow-[0_0_8px_rgba(247,172,255,0.4)]" (click)="toggleSetting('blur')">
                      <div class="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                    </button>
                  </div>
                  <div class="flex items-center justify-between">
                    <label class="text-sm">Low Light Enhancement</label>
                    <button class="w-12 h-6 bg-white/10 rounded-full relative transition-all" (click)="toggleSetting('lowlight')">
                      <div class="absolute left-1 top-1 w-4 h-4 bg-on-surface-variant rounded-full"></div>
                    </button>
                  </div>
                </div>
              </div>
              <div class="space-y-md">
                <div class="w-full aspect-video rounded-2xl overflow-hidden border border-white/10 relative group">
                  <img class="w-full h-full object-cover" src="https://i.pravatar.cc/400?img=12" alt="" />
                  <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span class="text-xs font-bold bg-black/60 px-md py-xs rounded-full">LIVE PREVIEW</span>
                  </div>
                </div>
                <div class="flex items-center gap-md">
                  <div class="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full bg-secondary-fixed w-1/3 shadow-[0_0_8px_rgba(125,244,255,0.6)]"></div>
                  </div>
                  <span class="material-symbols-outlined text-sm text-secondary-fixed">mic</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Sidebar -->
        <aside class="lg:col-span-4 space-y-lg">
          <!-- Appearance -->
          <div class="glass-panel rounded-3xl p-lg border border-white/10">
            <div class="flex items-center gap-md mb-lg">
              <span class="material-symbols-outlined text-tertiary">palette</span>
              <h2 class="font-headline-md text-headline-md">Appearance</h2>
            </div>
            <div class="space-y-lg">
              <div class="grid grid-cols-2 gap-md">
                <button class="flex flex-col items-center gap-sm p-md rounded-2xl bg-white/5 border-2 border-primary ring-2 ring-primary/20 transition-all">
                  <div class="w-full h-12 bg-surface rounded-lg border border-white/10 flex flex-col gap-1 p-2">
                    <div class="h-1 w-1/2 bg-primary rounded"></div>
                    <div class="h-1 w-1/3 bg-white/20 rounded"></div>
                  </div>
                  <span class="text-sm font-bold">Dark Glow</span>
                </button>
                <button class="flex flex-col items-center gap-sm p-md rounded-2xl bg-white/5 border border-white/10 hover:border-white/30 transition-all">
                  <div class="w-full h-12 bg-white rounded-lg border border-white/10 flex flex-col gap-1 p-2">
                    <div class="h-1 w-1/2 bg-blue-500 rounded"></div>
                    <div class="h-1 w-1/3 bg-gray-200 rounded"></div>
                  </div>
                  <span class="text-sm text-on-surface-variant">Lumina</span>
                </button>
              </div>
              <div class="space-y-xs">
                <label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Language</label>
                <select class="w-full bg-white/5 border border-white/10 rounded-xl px-md py-sm focus:border-tertiary focus:ring-1 focus:ring-tertiary outline-none appearance-none cursor-pointer">
                  <option class="bg-surface">English (US)</option>
                  <option class="bg-surface">Spanish (ES)</option>
                  <option class="bg-surface">French (FR)</option>
                  <option class="bg-surface">Japanese (JP)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Privacy -->
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
                  <h3 class="text-xl font-bold text-tertiary-fixed">98% Excellent</h3>
                </div>
                <span class="material-symbols-outlined text-3xl text-tertiary-fixed">verified</span>
              </div>
              <ul class="space-y-md">
                <li class="flex items-center justify-between text-sm">
                  <span class="text-on-surface-variant">Who can match with me?</span>
                  <span class="font-bold text-primary">Everyone</span>
                </li>
                <li class="flex items-center justify-between text-sm">
                  <span class="text-on-surface-variant">Show location tag?</span>
                  <button class="w-10 h-5 bg-white/10 rounded-full relative transition-all" (click)="toggleSetting('location')">
                    <div class="absolute left-1 top-1 w-3 h-3 bg-on-surface-variant rounded-full"></div>
                  </button>
                </li>
                <li class="flex items-center justify-between text-sm">
                  <span class="text-on-surface-variant">Blocked Users</span>
                  <span class="font-bold">12</span>
                </li>
              </ul>
              <button class="w-full py-md text-error font-bold border border-error/20 rounded-xl hover:bg-error/5 transition-all">
                Clear Match History
              </button>
            </div>
          </div>
        </aside>
      </div>

      <div class="mt-xl pt-xl border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-lg">
        <div class="flex gap-lg">
          <a class="text-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Privacy Policy</a>
          <a class="text-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Terms of Service</a>
          <a class="text-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Safety Center</a>
        </div>
        <button class="text-error-container hover:text-error text-sm font-bold transition-colors">Deactivate Account</button>
      </div>
    </div>
  `,
  styles: []
})
export class SettingsPageComponent {
  settings: Record<string, boolean> = {
    showOnlineStatus: true,
    locationSharing: false,
    profileDiscovery: true,
    backgroundBlur: true,
    lowLightMode: false,
    darkTheme: true,
    emailNotif: true
  };

  toggleSetting(key: string): void {
    this.settings[key] = !this.settings[key];
  }

  isOn(key: string): boolean {
    return !!this.settings[key];
  }
}
