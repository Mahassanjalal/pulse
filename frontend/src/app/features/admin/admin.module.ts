import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { FormsModule } from '@angular/forms';
import { AdminPageComponent } from './admin.page';

@NgModule({
  declarations: [AdminPageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: AdminPageComponent }]),
    SharedModule,
    FormsModule
  ]
})
export class AdminModule {}
