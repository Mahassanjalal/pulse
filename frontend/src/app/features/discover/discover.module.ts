import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { DiscoverPageComponent } from './discover.page';

@NgModule({
  declarations: [DiscoverPageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: DiscoverPageComponent }]),
    SharedModule,
    FormsModule
  ]
})
export class DiscoverModule {}
