import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { PremiumPageComponent } from './premium.page';

@NgModule({
  declarations: [PremiumPageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: PremiumPageComponent }]),
    SharedModule
  ]
})
export class PremiumModule {}
