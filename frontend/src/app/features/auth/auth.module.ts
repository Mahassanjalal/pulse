import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { AuthPageComponent } from './auth.page';

@NgModule({
  declarations: [AuthPageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: AuthPageComponent }]),
    ReactiveFormsModule,
    SharedModule
  ]
})
export class AuthModule {}
