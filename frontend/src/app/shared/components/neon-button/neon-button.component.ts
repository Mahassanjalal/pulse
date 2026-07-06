import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'pulse-neon-button',
  template: `
    <button
      [class]="buttonClass"
      [disabled]="disabled"
      (click)="onClick.emit()"
    >
      <ng-content></ng-content>
    </button>
  `,
  styles: [`
    button {
      padding: var(--space-md) var(--space-xl);
      border-radius: var(--radius-full);
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-sm);
      border: none;
      font-family: var(--font-display);
    }
    button:hover:not(:disabled) {
      transform: scale(1.05);
    }
    button:active:not(:disabled) {
      transform: scale(0.95);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class NeonButtonComponent {
  @Input() variant: 'primary' | 'secondary' | 'outline' | 'ghost' = 'primary';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() disabled = false;
  @Input() fullWidth = false;
  @Input() iconLeft?: string;
  @Input() iconRight?: string;
  @Output() onClick = new EventEmitter<void>();

  get buttonClass(): string {
    const base = 'transition-all active:scale-95';
    const sizes: Record<string, string> = {
      sm: 'py-2 px-4 text-sm',
      md: 'py-3 px-6 text-base',
      lg: 'py-4 px-8 text-lg'
    };
    const variants: Record<string, string> = {
      primary: 'bg-primary text-on-primary neon-glow-primary',
      secondary: 'bg-secondary-container text-on-secondary-container neon-glow-secondary',
      outline: 'glass-panel text-on-surface hover:bg-white/10',
      ghost: 'text-primary hover:bg-primary/10'
    };
    return `${base} ${sizes[this.size]} ${variants[this.variant]} ${this.fullWidth ? 'w-full' : ''}`;
  }
}
