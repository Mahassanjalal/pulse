import { Component, Input } from '@angular/core';

@Component({
  selector: 'pulse-glass-card',
  template: `
    <div class="glass-card rounded-2xl p-lg" [ngStyle]="{ minHeight: minHeight }">
      <ng-content></ng-content>
    </div>
  `,
  styles: []
})
export class GlassCardComponent {
  @Input() minHeight = 'auto';
  @Input() padding = 'lg';
}
