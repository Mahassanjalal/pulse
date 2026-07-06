import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { DashboardPageComponent } from './dashboard.page';

@NgModule({
  declarations: [DashboardPageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: DashboardPageComponent }]),
    SharedModule
  ]
})
export class DashboardModule {}
