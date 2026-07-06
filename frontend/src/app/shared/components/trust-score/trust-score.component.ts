import { Component, Input } from '@angular/core';

@Component({
  selector: 'pulse-trust-score',
  template: `
    <div class="flex flex-col items-center">
      <div class="relative w-16 h-16">
        <svg class="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            stroke-width="3"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            [attr.stroke]="scoreColor"
            stroke-width="3"
            [attr.stroke-dasharray]="score + ', 100'"
            class="transition-all duration-1000"
          />
        </svg>
        <span class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 font-bold text-sm">{{ score }}</span>
      </div>
      <span class="text-xs text-on-surface-variant mt-2">Trust Score</span>
    </div>
  `,
  styles: []
})
export class TrustScoreComponent {
  @Input() score = 50;

  get scoreColor(): string {
    if (this.score >= 80) return '#2ae500';
    if (this.score >= 50) return '#f7acff';
    return '#ffb4ab';
  }
}
