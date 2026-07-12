import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../core/services/admin.service';

@Component({
  selector: 'pulse-admin-broadcast',
  template: `
    <div class="glass-panel rounded-2xl p-lg max-w-xl mx-auto">
      <h2 class="font-headline-md text-headline-md text-on-surface mb-md">Broadcast Notification</h2>
      <p class="text-sm text-on-surface-variant mb-md">Sends a real-time push to all connected users.</p>
      <input [(ngModel)]="title" placeholder="Title"
             class="w-full mb-2 bg-surface-container text-on-surface rounded-lg px-3 py-2 border border-white/5" />
      <textarea [(ngModel)]="message" placeholder="Message" rows="4"
                class="w-full mb-3 bg-surface-container text-on-surface rounded-lg px-3 py-2 border border-white/5"></textarea>
      <button (click)="send()" [disabled]="sending"
              class="w-full px-4 py-2 rounded-lg bg-primary text-on-primary font-label disabled:opacity-40">
        {{ sending ? 'Sending…' : 'Send broadcast' }}
      </button>
      <p *ngIf="done" class="text-tertiary text-sm mt-2">Broadcast sent.</p>
    </div>
  `,
  styles: []
})
export class AdminBroadcastComponent {
  title = ''; message = ''; sending = false; done = false;
  constructor(private admin: AdminService) {}
  send(): void {
    if (!this.title || !this.message) return;
    this.sending = true; this.done = false;
    this.admin.broadcast(this.title, this.message).subscribe({
      next: () => { this.sending = false; this.done = true; this.title = ''; this.message = ''; },
      error: () => { this.sending = false; alert('Broadcast failed'); },
    });
  }
}
