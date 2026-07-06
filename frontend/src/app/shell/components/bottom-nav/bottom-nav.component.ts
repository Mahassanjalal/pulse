import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'pulse-bottom-nav',
  template: `
    <nav class="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface/80 backdrop-blur-xl flex items-center justify-around px-lg z-50 border-t border-white/10">
      <a routerLink="/dashboard" class="flex flex-col items-center" routerLinkActive="!active">
        <span class="material-symbols-outlined text-on-surface">home</span>
        <span class="font-label-sm text-label-sm mt-1">Home</span>
      </a>
      <a routerLink="/discover" class="flex flex-col items-center" routerLinkActive="!active">
        <span class="material-symbols-outlined text-on-surface-variant">explore</span>
        <span class="font-label-sm text-label-sm mt-1">Explore</span>
      </a>
      <a routerLink="/video/random" class="flex flex-col items-center -mt-6">
        <div class="w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/40 text-on-primary">
          <span class="material-symbols-outlined">add</span>
        </div>
      </a>
      <a routerLink="/messages" class="flex flex-col items-center" routerLinkActive="!active">
        <span class="material-symbols-outlined text-on-surface-variant">chat</span>
        <span class="font-label-sm text-label-sm mt-1">Messages</span>
      </a>
      <a routerLink="/profile" class="flex flex-col items-center" routerLinkActive="!active">
        <span class="material-symbols-outlined text-on-surface-variant">person</span>
        <span class="font-label-sm text-label-sm mt-1">Profile</span>
      </a>
    </nav>
  `,
  styles: []
})
export class BottomNavComponent {}
