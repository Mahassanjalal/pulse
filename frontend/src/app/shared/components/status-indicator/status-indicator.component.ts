import { Component, Input } from '@angular/core';

@Component({
  selector: 'pulse-status-indicator',
  template: `
    <span class="relative inline-block" [ngClass]="size">
      <span
        class="block rounded-full"
        [ngStyle]="{
          width: sizeMap[this.size].dot,
          height: sizeMap[this.size].dot,
          backgroundColor: color,
          boxShadow: status === 'online' ? '0 0 0 rgba(42, 229, 0, 0.4)' : 'none'
        }"
      ></span>
      <span
        *ngIf="status === 'online'"
        class="absolute top-0 left-0 block rounded-full"
        [ngStyle]="{
          width: sizeMap[this.size].dot,
          height: sizeMap[this.size].dot,
          backgroundColor: color,
          animation: 'pulse-ring-sm 1.5s infinite'
        }"
      ></span>
    </span>
  `,
  styles: []
})
export class StatusIndicatorComponent {
  @Input() status: 'online' | 'offline' | 'away' = 'offline';
  @Input() size: 'sm' | 'md' | 'lg' = 'sm';

  readonly sizeMap = {
    sm: { dot: '8px' },
    md: { dot: '12px' },
    lg: { dot: '16px' }
  };

  get color(): string {
    switch (this.status) {
      case 'online': return '#2ae500';
      case 'away': return '#ffb4ab';
      default: return '#666';
    }
  }
}
