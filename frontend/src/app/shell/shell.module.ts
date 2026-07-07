import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { BottomNavComponent } from './components/bottom-nav/bottom-nav.component';
import { VideoChatShellComponent } from './components/video-chat-shell/video-chat-shell.component';
import { SidebarToggleComponent } from './components/sidebar-toggle/sidebar-toggle.component';
import { PublicHeaderComponent } from './components/public-header/public-header.component';

@NgModule({
  declarations: [
    HeaderComponent,
    SidebarComponent,
    BottomNavComponent,
    VideoChatShellComponent,
    SidebarToggleComponent,
    PublicHeaderComponent
  ],
  imports: [CommonModule, RouterModule],
  exports: [
    HeaderComponent,
    SidebarComponent,
    BottomNavComponent,
    VideoChatShellComponent,
    SidebarToggleComponent,
    PublicHeaderComponent
  ]
})
export class ShellModule {}
