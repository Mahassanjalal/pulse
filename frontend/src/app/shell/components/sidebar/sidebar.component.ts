import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'pulse-sidebar',
  template: `
    <aside class="hidden md:flex fixed left-0 top-0 h-full flex-col p-lg bg-surface/80 backdrop-blur-xl w-72 border-r border-white/10 shadow-[0_0_12px_rgba(247,172,255,0.4)] z-50">
      <div class="mb-xl">
        <a routerLink="/dashboard" class="font-display-lg text-display-lg font-extrabold text-primary tracking-tighter">Pulse</a>
        <p class="font-label-md text-label-md text-on-surface-variant opacity-70">Global Discovery</p>
      </div>
      <nav class="flex-grow space-y-md">
        <a routerLink="/dashboard" routerLinkActive="active" class="sidebar-item"
           [routerLinkActiveOptions]="{exact: true}">
          <span class="material-symbols-outlined">home</span>
          <span class="font-label-md text-label-md">Home</span>
        </a>
        <a routerLink="/messages" routerLinkActive="active" class="sidebar-item">
          <span class="material-symbols-outlined">chat_bubble</span>
          <span class="font-label-md text-label-md">Messages</span>
        </a>
        <a routerLink="/friends" routerLinkActive="active" class="sidebar-item">
          <span class="material-symbols-outlined">group</span>
          <span class="font-label-md text-label-md">Friends</span>
        </a>
        <a routerLink="/profile" routerLinkActive="active" class="sidebar-item">
          <span class="material-symbols-outlined">person</span>
          <span class="font-label-md text-label-md">Profile</span>
        </a>
        <a routerLink="/notifications" routerLinkActive="active" class="sidebar-item relative">
          <span class="material-symbols-outlined">notifications</span>
          <span class="font-label-md text-label-md">Notifications</span>
          <span class="absolute right-4 top-1/2 -translate-y-1/2 bg-primary text-on-primary font-label-sm text-label-sm px-1.5 rounded-full">3</span>
        </a>

        <div class="pt-lg border-t border-white/5 mt-lg">
          <p class="font-label-sm text-label-sm text-on-surface-variant mb-md uppercase tracking-wider">Video Chat</p>
          <a routerLink="/video" routerLinkActive="active" class="sidebar-item">
            <span class="material-symbols-outlined">videocam</span>
            <span class="font-label-md text-label-md">With Friends</span>
          </a>
          <a routerLink="/discover" routerLinkActive="active" class="sidebar-item">
            <span class="material-symbols-outlined">explore</span>
            <span class="font-label-md text-label-md">Discover</span>
          </a>
        </div>
      </nav>
      <div class="mt-auto">
        <button class="w-full bg-primary-container text-on-primary-container py-md rounded-xl font-headline-md text-headline-md flex items-center justify-center gap-sm hover:brightness-110 active:scale-95 transition-all shadow-lg neon-glow-purple">
          <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">bolt</span>
          Start Matching
        </button>
      </div>
    </aside>
  `,
  styles: [`
    .sidebar-item {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      padding: var(--space-sm) var(--space-md);
      color: var(--color-on-surface-variant);
      cursor: pointer;
      transition: all 0.3s ease;
      text-decoration: none;
    }
    .sidebar-item:hover {
      background-color: rgba(255, 255, 255, 0.05);
      color: var(--color-primary);
    }
    .sidebar-item:active {
      transform: scale(0.95);
    }
    .sidebar-item.active {
      color: var(--color-secondary-fixed);
      font-weight: 700;
      background-color: rgba(125, 244, 255, 0.1);
      border-left: 4px solid var(--color-secondary-fixed);
    }
  `]
})
export class SidebarComponent {
  constructor(private router: Router) {}
}
