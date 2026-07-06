import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { ProfilePageComponent } from './profile.page';

@NgModule({
  declarations: [ProfilePageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: ProfilePageComponent }]),
    FormsModule,
    SharedModule
  ]
})
export class ProfileModule {}
