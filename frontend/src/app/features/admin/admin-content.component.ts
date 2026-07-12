import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminMessage, AdminMatch } from '../../core/services/admin.service';

@Component({
  selector: 'pulse-admin-content',
  template: `
    <div class="space-y-lg">
      <!-- Messages -->
      <section>
        <h2 class="font-headline-md text-headline-md text-on-surface mb-md">Messages</h2>
        <div class="glass-panel rounded-2xl p-md flex flex-wrap items-end gap-md mb-md">
          <div class="flex-1 min-w-[180px]">
            <label class="text-xs text-on-surface-variant uppercase">User id</label>
            <input [(ngModel)]="userId" (keyup.enter)="loadMessages()" placeholder="filter by user id"
                   class="w-full mt-1 bg-surface-container text-on-surface rounded-lg px-3 py-2 border border-white/5" />
          </div>
          <div class="flex-1 min-w-[180px]">
            <label class="text-xs text-on-surface-variant uppercase">Match id</label>
            <input [(ngModel)]="matchId" (keyup.enter)="loadMessages()" placeholder="filter by match id"
                   class="w-full mt-1 bg-surface-container text-on-surface rounded-lg px-3 py-2 border border-white/5" />
          </div>
          <button (click)="loadMessages()" class="px-4 py-2 rounded-lg bg-primary text-on-primary font-label">Search</button>
        </div>

        <div *ngIf="msgLoading" class="text-on-surface-variant py-sm">Loading…</div>
        <div *ngFor="let m of messages" class="glass-panel rounded-xl p-md mb-sm flex items-start justify-between gap-md">
          <div class="min-w-0">
            <p class="text-xs text-on-surface-variant">@{{ m.sender?.username || m.senderId }} → @{{ m.receiver?.username || m.receiverId }} · {{ m.type }} · {{ m.createdAt | date:'short' }}</p>
            <p class="text-on-surface break-words">{{ m.deleted ? '[deleted]' : m.content }}</p>
          </div>
          <button *ngIf="!m.deleted" (click)="delMessage(m)" class="shrink-0 text-xs px-2 py-1 rounded bg-error/20 text-error hover:bg-error/30">Delete</button>
        </div>
      </section>

      <!-- Matches -->
      <section>
        <h2 class="font-headline-md text-headline-md text-on-surface mb-md">Matches</h2>
        <div *ngIf="matchLoading" class="text-on-surface-variant py-sm">Loading…</div>
        <div *ngFor="let mt of matches" class="glass-panel rounded-xl p-md mb-sm flex items-center justify-between gap-md">
          <div class="text-sm text-on-surface">
            @{{ mt.user1?.username || mt.user1Id }} ↔ @{{ mt.user2?.username || mt.user2Id }}
            <span class="ml-2 text-xs text-on-surface-variant">{{ mt.status }} · {{ mt.startTime | date:'short' }}</span>
          </div>
          <div class="flex gap-2">
            <button *ngIf="mt.status !== 'ENDED'" (click)="endMatch(mt)" class="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">End</button>
            <button (click)="delMatch(mt)" class="text-xs px-2 py-1 rounded bg-error/20 text-error hover:bg-error/30">Delete</button>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: []
})
export class AdminContentComponent implements OnInit {
  messages: AdminMessage[] = []; matches: AdminMatch[] = [];
  userId = ''; matchId = ''; msgLoading = true; matchLoading = true;

  constructor(private admin: AdminService) {}

  ngOnInit(): void { this.loadMessages(); this.loadMatches(); }

  loadMessages(): void {
    this.msgLoading = true;
    this.admin.listMessages(this.userId, this.matchId).subscribe({
      next: (r) => { this.messages = r.messages; this.msgLoading = false; },
      error: () => { this.msgLoading = false; },
    });
  }
  delMessage(m: AdminMessage): void {
    if (!confirm('Delete this message?')) return;
    this.admin.deleteMessage(m.id).subscribe({ next: () => { this.messages = this.messages.filter(x => x.id !== m.id); } });
  }
  loadMatches(): void {
    this.matchLoading = true;
    this.admin.listMatches().subscribe({
      next: (r) => { this.matches = r.matches; this.matchLoading = false; },
      error: () => { this.matchLoading = false; },
    });
  }
  endMatch(mt: AdminMatch): void {
    this.admin.endMatch(mt.id).subscribe({ next: () => { this.loadMatches(); } });
  }
  delMatch(mt: AdminMatch): void {
    if (!confirm('Delete match and all its messages?')) return;
    this.admin.deleteMatch(mt.id).subscribe({ next: () => { this.loadMatches(); } });
  }
}
