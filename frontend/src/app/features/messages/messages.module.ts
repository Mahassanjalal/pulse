import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { MessagesPageComponent } from './messages.page';

@NgModule({
  declarations: [MessagesPageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: MessagesPageComponent }]),
    FormsModule,
    SharedModule
  ]
})
export class MessagesModule {}
