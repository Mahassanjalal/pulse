import { Component, Input } from '@angular/core';

@Component({
  selector: 'pulse-input',
  template: `
    <div class="w-full">
      <label *ngIf="label" class="block font-label-md text-label-md text-on-surface-variant px-1 mb-sm">{{ label }}</label>
      <input
        [type]="type"
        [placeholder]="placeholder"
        [value]="value"
        (input)="onInput($event)"
        [class]="inputClass"
      />
      <span *ngIf="icon" class="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant material-symbols-outlined text-sm">{{ icon }}</span>
      <p *ngIf="hint" class="font-label-sm text-label-sm text-on-surface-variant mt-xs">{{ hint }}</p>
    </div>
  `,
  styles: [`
    input {
      width: 100%;
      height: 56px;
      background-color: var(--color-surface-container-high);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-lg);
      padding: 0 var(--space-md);
      color: var(--color-on-surface);
      font-size: 16px;
      transition: all 0.2s ease;
    }
    input:focus {
      outline: none;
      border-color: var(--color-secondary);
      box-shadow: 0 0 10px rgba(0, 238, 252, 0.2);
    }
    input::placeholder {
      color: rgba(160, 138, 159, 0.5);
    }
  `]
})
export class InputComponent {
  @Input() type = 'text';
  @Input() label = '';
  @Input() placeholder = '';
  @Input() value = '';
  @Input() icon = '';
  @Input() hint = '';

  get inputClass(): string {
    return this.icon ? 'pl-4 pr-12' : 'pl-4';
  }

  onInput(event: Event): void {
    this.value = (event.target as HTMLInputElement).value;
  }
}
