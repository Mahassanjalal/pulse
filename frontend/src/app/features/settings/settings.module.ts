import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '@shared/shared.module';
import { SettingsPageComponent } from './settings.page';

@NgModule({
  declarations: [SettingsPageComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: SettingsPageComponent }]),
    SharedModule,
    FormsModule
  ]
})
export class SettingsModule {}
