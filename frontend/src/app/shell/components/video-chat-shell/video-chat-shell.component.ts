import { Component } from '@angular/core';

@Component({
  selector: 'pulse-video-chat-shell',
  template: `
    <div class="fixed inset-0 bg-background">
      <header class="fixed top-0 left-0 right-0 z-50 h-20 flex items-center justify-between px-lg md:px-xl bg-surface/40 backdrop-blur-md border-b border-white/5">
        <div class="flex items-center gap-md">
          <span class="font-display-lg text-display-lg font-black text-primary tracking-tighter">Pulse</span>
        </div>
        <div class="flex items-center gap-md">
          <span class="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary">settings</span>
          <div class="w-10 h-10 rounded-full border border-primary/30 overflow-hidden">
            <img class="w-full h-full object-cover" src="https://i.pravatar.cc/100?img=1" alt="Profile" />
          </div>
        </div>
      </header>
      <ng-content></ng-content>
    </div>
  `,
  styles: []
})
export class VideoChatShellComponent {}
