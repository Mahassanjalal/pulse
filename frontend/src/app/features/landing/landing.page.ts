import { Component, HostListener } from '@angular/core';

@Component({
  selector: 'pulse-landing',
  templateUrl: './landing.page.html',
  styles: []
})
export class LandingPageComponent {
  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    const x = e.clientX / window.innerWidth - 0.5;
    const y = e.clientY / window.innerHeight - 0.5;
    const speed = 10;
    document.querySelectorAll<HTMLElement>('.parallax-card').forEach(card => {
      card.style.transform = `translate3d(${x * speed}px, ${y * speed}px, 0)`;
    });
  }
}
