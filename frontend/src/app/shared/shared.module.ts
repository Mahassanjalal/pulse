import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PlanListComponent } from '@shared/components/plan-list/plan-list.component';
import { ShaderBgDirective } from '@shared/directives/shader-bg.directive';
import { ParticlesBgDirective } from '@shared/directives/particles-bg.directive';

const sharedComponents = [
  PlanListComponent
];

@NgModule({
  declarations: [...sharedComponents, ShaderBgDirective, ParticlesBgDirective],
  imports: [CommonModule, FormsModule],
  exports: [...sharedComponents, ShaderBgDirective, ParticlesBgDirective, CommonModule, FormsModule]
})
export class SharedModule {}
