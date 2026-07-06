import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { FriendsPageComponent } from './friends.page';

@NgModule({
  declarations: [FriendsPageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: FriendsPageComponent }]),
    FormsModule,
    SharedModule
  ]
})
export class FriendsModule {}
