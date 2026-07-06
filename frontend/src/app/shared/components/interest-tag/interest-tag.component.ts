import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'pulse-interest-tag',
  template: `
    <span
      class="inline-flex items-center px-md py-sm rounded-full border text-xs font-medium cursor-pointer transition-all"
      [class]="selected ? 'bg-secondary-fixed/20 text-secondary-fixed border-secondary-fixed/30' : 'bg-white/5 text-on-surface border-white/10 hover:border-white/30'"
      (click)="toggle()"
    >
      {{ label }}
    </span>
  `,
  styles: []
})
export class InterestTagComponent {
  @Input() label = '';
  @Input() selected = false;
  @Output() onChange = new EventEmitter<boolean>();

  toggle(): void {
    this.selected = !this.selected;
    this.onChange.emit(this.selected);
  }
}
