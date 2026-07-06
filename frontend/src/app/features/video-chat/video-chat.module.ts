import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { VideoChatPageComponent } from './video-chat.page';

@NgModule({
  declarations: [VideoChatPageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: VideoChatPageComponent }]),
    FormsModule,
    SharedModule
  ]
})
export class VideoChatModule {}
