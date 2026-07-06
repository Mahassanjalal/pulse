import { Component, HostListener } from '@angular/core';

@Component({
  selector: 'pulse-video-chat',
  templateUrl: './video-chat.page.html',
  styles: []
})
export class VideoChatPageComponent {
  chatOpen = true;
  isMuted = false;
  isCameraOff = false;
  newChatMessage = '';
  matchTime = '00:42';
  glowX = 0;
  glowY = 0;

  chatMessages = [
    { text: 'Hey! Where are you from?', self: false, time: '10:01' },
    { text: 'I\'m from Tokyo! You?', self: true, time: '10:01' },
    { text: 'Amazing! I\'ve always wanted to visit Japan 🇯🇵', self: false, time: '10:02' },
    { text: 'You should! What are your interests?', self: true, time: '10:02' }
  ];

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    this.glowX = (e.clientX / window.innerWidth - 0.5) * 20;
    this.glowY = (e.clientY / window.innerHeight - 0.5) * 20;
  }
}
