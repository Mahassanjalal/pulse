import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { AboutPageComponent } from './about.page';

@NgModule({
  declarations: [AboutPageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: AboutPageComponent }]),
    SharedModule
  ]
})
export class AboutModule {}
