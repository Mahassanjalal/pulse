import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminFriend, AdminFriendRequest, AdminBlock } from '../../core/services/admin.service';

@Component({
  selector: 'pulse-admin-social',
  template: `
    <div class="grid md:grid-cols-3 gap-md">
      <section class="glass-panel rounded-2xl p-md">
        <h2 class="font-headline-sm text-headline-sm text-on-surface mb-md">Friends</h2>
        <div *ngFor="let f of friends" class="flex items-center justify-between text-sm mb-1">
          <span class="text-on-surface">@{{ f.sender?.username }} ↔ @{{ f.receiver?.username }}</span>
          <button (click)="remove(f)" class="text-xs px-2 py-0.5 rounded bg-error/20 text-error">Remove</button>
        </div>
        <div *ngIf="friends.length===0" class="text-xs text-on-surface-variant">None</div>
      </section>

      <section class="glass-panel rounded-2xl p-md">
        <h2 class="font-headline-sm text-headline-sm text-on-surface mb-md">Friend Requests</h2>
        <div *ngFor="let r of requests" class="flex items-center justify-between text-sm mb-1">
          <span class="text-on-surface">@{{ r.fromUser?.username }} → @{{ r.toUser?.username }} <span class="text-on-surface-variant text-xs">{{ r.status }}</span></span>
          <button (click)="cancel(r)" class="text-xs px-2 py-0.5 rounded bg-error/20 text-error">Cancel</button>
        </div>
        <div *ngIf="requests.length===0" class="text-xs text-on-surface-variant">None</div>
      </section>

      <section class="glass-panel rounded-2xl p-md">
        <h2 class="font-headline-sm text-headline-sm text-on-surface mb-md">Blocks</h2>
        <div *ngFor="let b of blocks" class="flex items-center justify-between text-sm mb-1">
          <span class="text-on-surface">@{{ b.user?.username }} → @{{ b.blockedUserId }}</span>
          <button (click)="unblock(b)" class="text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20">Unblock</button>
        </div>
        <div *ngIf="blocks.length===0" class="text-xs text-on-surface-variant">None</div>
      </section>
    </div>
  `,
  styles: []
})
export class AdminSocialComponent implements OnInit {
  friends: AdminFriend[] = []; requests: AdminFriendRequest[] = []; blocks: AdminBlock[] = [];

  constructor(private admin: AdminService) {}

  ngOnInit(): void {
    this.admin.listFriends().subscribe({ next: (r) => { this.friends = r.friends; }, error: () => {} });
    this.admin.listFriendRequests().subscribe({ next: (r) => { this.requests = r.requests; }, error: () => {} });
    this.admin.listBlocks().subscribe({ next: (r) => { this.blocks = r.blocks; }, error: () => {} });
  }
  remove(f: AdminFriend): void {
    if (!confirm('Remove this friendship?')) return;
    this.admin.removeFriend(f.id).subscribe({ next: () => { this.friends = this.friends.filter(x => x.id !== f.id); } });
  }
  cancel(r: AdminFriendRequest): void {
    this.admin.cancelFriendRequest(r.id).subscribe({ next: () => { this.requests = this.requests.filter(x => x.id !== r.id); } });
  }
  unblock(b: AdminBlock): void {
    this.admin.unblock(b.id).subscribe({ next: () => { this.blocks = this.blocks.filter(x => x.id !== b.id); } });
  }
}
