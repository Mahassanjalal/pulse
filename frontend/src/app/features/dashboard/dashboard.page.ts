import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'pulse-dashboard',
  templateUrl: './dashboard.page.html',
  styles: []
})
export class DashboardPageComponent {
  onCardEnter(el: HTMLElement): void {
    el.style.borderColor = 'rgba(247, 172, 255, 0.4)';
    el.style.transform = 'translateY(-2px)';
  }

  onCardLeave(el: HTMLElement): void {
    el.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    el.style.transform = 'translateY(0)';
  }
}
