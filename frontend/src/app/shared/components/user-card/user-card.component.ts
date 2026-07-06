import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'pulse-user-card',
  template: `
    <div class="relative group aspect-[3/4] rounded-2xl overflow-hidden glass-panel border border-white/10 cursor-pointer" (click)="onClick.emit(user)">
      <div
        class="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
        [ngStyle]="{ 'background-image': 'url(' + (user.avatar || 'https://via.placeholder.com/300') + ')' }"
      ></div>
      <div class="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"></div>
      <div class="absolute top-4 left-4" *ngIf="user.onlineStatus === 'online'">
        <span class="bg-tertiary px-sm py-xs rounded-lg flex items-center gap-xs">
          <span class="w-1.5 h-1.5 bg-white rounded-full animate-pulse-ring"></span>
          <span class="font-label-sm text-label-sm font-bold text-on-tertiary">LIVE</span>
        </span>
      </div>
      <div class="absolute top-4 right-4" *ngIf="user.isVerified">
        <span class="material-symbols-outlined text-white text-secondary" style="font-variation-settings: 'FILL' 1;">verified</span>
      </div>
      <div class="absolute bottom-0 left-0 right-0 p-lg">
        <h4 class="font-headline-md text-headline-md text-white mb-sm">{{ user.name }}</h4>
        <div class="flex gap-xs overflow-hidden flex-wrap">
          <span
            *ngFor="let interest of user.interests?.slice(0, 3)"
            class="bg-surface/60 backdrop-blur-md px-sm py-1 rounded-full font-label-sm text-label-sm text-secondary border border-secondary/30"
          >
            #{{ interest }}
          </span>
        </div>
        <div class="flex items-center gap-sm mt-sm text-white/80 font-label-sm text-label-sm">
          <span class="material-symbols-outlined text-[14px]">location_on</span>
          {{ user.location }}
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class UserCardComponent {
  @Input() user: any;
  @Output() onClick = new EventEmitter<any>();
}
