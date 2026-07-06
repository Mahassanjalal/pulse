import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { AuthPageComponent } from './auth.page';

@NgModule({
  declarations: [AuthPageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: AuthPageComponent }]),
    FormsModule,
    SharedModule
  ]
})
export class AuthModule {}
