import { Component, Input } from '@angular/core';

@Component({
  selector: 'pulse-video-player',
  template: `
    <div class="relative rounded-xl overflow-hidden bg-surface-container">
      <video
        #videoElement
        [autoplay]="autoplay"
        [muted]="muted"
        playsInline
        class="w-full h-full object-cover"
      ></video>
      <div class="absolute bottom-2 right-2">
        <pulse-status-indicator [status]="status" size="sm" />
      </div>
      <ng-content></ng-content>
    </div>
  `,
  styles: []
})
export class VideoPlayerComponent {
  @Input() src = '';
  @Input() autoplay = false;
  @Input() muted = true;
  @Input() status: 'online' | 'offline' | 'away' = 'offline';
  @Input() showControls = false;

  videoElement: HTMLVideoElement | null = null;
}
