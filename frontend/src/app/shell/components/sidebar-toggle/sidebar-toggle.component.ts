import { Component } from '@angular/core';

@Component({
  selector: 'pulse-sidebar-toggle',
  template: `
    <button class="md:hidden p-2" (click)="toggleSidebar()">
      <span class="material-symbols-outlined text-on-surface">menu</span>
    </button>
  `,
  styles: []
})
export class SidebarToggleComponent {
  sidebarOpen = false;

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    document.querySelector('pulse-sidebar')?.classList.toggle('mobile-open', this.sidebarOpen);
  }
}
