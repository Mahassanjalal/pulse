import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'pulse-admin-paginator',
  template: `
    <div class="flex items-center justify-between mt-4 text-sm text-on-surface-variant">
      <span>{{ total }} total · page {{ page }} / {{ totalPages }}</span>
      <div class="flex gap-2">
        <button [disabled]="page <= 1" (click)="go(page - 1)" type="button"
                class="px-3 py-1 rounded bg-white/10 disabled:opacity-30 hover:bg-white/20">Prev</button>
        <button [disabled]="page >= totalPages" (click)="go(page + 1)" type="button"
                class="px-3 py-1 rounded bg-white/10 disabled:opacity-30 hover:bg-white/20">Next</button>
      </div>
    </div>
  `,
  styles: []
})
export class AdminPaginatorComponent {
  @Input() page = 1;
  @Input() limit = 20;
  @Input() total = 0;
  @Output() pageChange = new EventEmitter<number>();

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  go(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.pageChange.emit(p);
  }
}
