import { Component, Input } from '@angular/core';

@Component({
  selector: 'pulse-badge',
  template: `
    <span
      class="inline-flex items-center gap-xs px-2 py-0.5 rounded-full font-label-sm text-label-sm"
      [ngClass]="badgeClass"
    >
      <span *ngIf="icon" class="material-symbols-outlined text-[14px]">{{ icon }}</span>
      {{ text }}
    </span>
  `,
  styles: []
})
export class BadgeComponent {
  @Input() type: 'verified' | 'premium' | 'online' | 'new' | 'warning' = 'verified';
  @Input() text = '';
  @Input() icon = '';

  get badgeClass(): Record<string, boolean> {
    const cls = this.getBadgeClass();
    return { [cls]: true };
  }

  private getBadgeClass(): string {
    switch (this.type) {
      case 'verified': return 'bg-secondary/20 text-secondary';
      case 'premium': return 'bg-primary/20 text-primary';
      case 'online': return 'bg-tertiary/20 text-tertiary';
      case 'new': return 'bg-error/20 text-error';
      case 'warning': return 'bg-error/20 text-error';
      default: return '';
    }
  }
}
