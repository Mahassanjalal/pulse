import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { NeonButtonComponent } from '@shared/components/neon-button/neon-button.component';
import { GlassCardComponent } from '@shared/components/glass-card/glass-card.component';
import { UserCardComponent } from '@shared/components/user-card/user-card.component';
import { InterestTagComponent } from '@shared/components/interest-tag/interest-tag.component';
import { StatusIndicatorComponent } from '@shared/components/status-indicator/status-indicator.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { VideoPlayerComponent } from '@shared/components/video-player/video-player.component';
import { TrustScoreComponent } from '@shared/components/trust-score/trust-score.component';
import { InputComponent } from '@shared/components/input/input.component';
import { ChatBubbleComponent } from '@shared/components/chat-bubble/chat-bubble.component';
import { ShaderBgDirective } from '@shared/directives/shader-bg.directive';
import { ParticlesBgDirective } from '@shared/directives/particles-bg.directive';

const sharedComponents = [
  NeonButtonComponent,
  GlassCardComponent,
  UserCardComponent,
  InterestTagComponent,
  StatusIndicatorComponent,
  BadgeComponent,
  VideoPlayerComponent,
  TrustScoreComponent,
  InputComponent,
  ChatBubbleComponent
];

@NgModule({
  declarations: [...sharedComponents, ShaderBgDirective, ParticlesBgDirective],
  imports: [CommonModule, FormsModule],
  exports: [...sharedComponents, ShaderBgDirective, ParticlesBgDirective, CommonModule, FormsModule]
})
export class SharedModule {}
