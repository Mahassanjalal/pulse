import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PlanListComponent } from '@shared/components/plan-list/plan-list.component';
import { ShaderBgDirective } from '@shared/directives/shader-bg.directive';
import { ParticlesBgDirective } from '@shared/directives/particles-bg.directive';
import { FriendCallWidgetComponent } from './components/friend-call-widget/friend-call-widget.component';
import { AdminPaginatorComponent } from './components/admin-paginator/admin-paginator.component';
import { MediaPipe } from './media.pipe';
const sharedComponents = [
  PlanListComponent,
  FriendCallWidgetComponent,
  AdminPaginatorComponent
];

@NgModule({
  declarations: [...sharedComponents, ShaderBgDirective, ParticlesBgDirective, MediaPipe],
  imports: [CommonModule, FormsModule],
  exports: [...sharedComponents, ShaderBgDirective, ParticlesBgDirective, MediaPipe, CommonModule, FormsModule]
})
export class SharedModule {}
