import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { FormsModule } from '@angular/forms';
import { NotificationsPageComponent } from './notifications.page';

@NgModule({
  declarations: [NotificationsPageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: NotificationsPageComponent }]),
    SharedModule,
    FormsModule
  ]
})
export class NotificationsModule {}
