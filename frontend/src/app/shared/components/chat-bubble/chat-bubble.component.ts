import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'pulse-chat-bubble',
  template: `
    <div class="flex items-start gap-sm" [class.flex-row-reverse]="isSelf">
      <div class="w-8 h-8 rounded-full overflow-hidden bg-surface-container-highest shrink-0" *ngIf="showAvatar">
        <img class="w-full h-full object-cover" [src]="avatar" alt="" />
      </div>
      <div class="flex flex-col gap-1 max-w-[80%]" [class.items-end]="isSelf">
        <div
          class="p-md rounded-2xl"
          [class]="bubbleClass"
        >
          <p class="text-body-md">{{ content }}</p>
        </div>
        <span class="text-xs text-on-surface-variant {{ isSelf ? 'mr-1' : 'ml-1' }}">{{ timestamp }}</span>
      </div>
    </div>
  `,
  styles: [`
    .self-bubble { background: var(--color-primary-container); color: var(--color-on-primary-container); }
    .other-bubble { background: var(--color-surface-container-highest); color: var(--color-on-surface); }
  `]
})
export class ChatBubbleComponent {
  @Input() content = '';
  @Input() timestamp = '';
  @Input() isSelf = false;
  @Input() showAvatar = false;
  @Input() avatar = '';

  get bubbleClass(): string {
    return this.isSelf ? 'self-bubble rounded-tr-none' : 'other-bubble rounded-tl-none';
  }
}
