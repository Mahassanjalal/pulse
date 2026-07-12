import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { FormsModule } from '@angular/forms';
import { AdminGuard } from '@core/guards/auth.guard';
import { AdminPageComponent } from './admin.page';
import { AdminUsersComponent } from './admin-users.component';
import { AdminReportsComponent } from './admin-reports.component';
import { AdminContentComponent } from './admin-content.component';
import { AdminPremiumComponent } from './admin-premium.component';
import { AdminSocialComponent } from './admin-social.component';
import { AdminBroadcastComponent } from './admin-broadcast.component';
import { AdminSettingsComponent } from './admin-settings.component';
import { AdminAuditComponent } from './admin-audit.component';

@NgModule({
  declarations: [
    AdminPageComponent,
    AdminUsersComponent,
    AdminReportsComponent,
    AdminContentComponent,
    AdminPremiumComponent,
    AdminSocialComponent,
    AdminBroadcastComponent,
    AdminSettingsComponent,
    AdminAuditComponent,
  ],
  imports: [
    CommonModule,
    RouterModule.forChild([
      {
        path: '',
        component: AdminPageComponent,
        children: [
          { path: '', redirectTo: 'users', pathMatch: 'full' },
          { path: 'users', component: AdminUsersComponent },
          { path: 'reports', component: AdminReportsComponent },
          { path: 'content', component: AdminContentComponent },
          { path: 'social', component: AdminSocialComponent },
          { path: 'premium', component: AdminPremiumComponent },
          { path: 'broadcast', component: AdminBroadcastComponent, canActivate: [AdminGuard] },
          { path: 'settings', component: AdminSettingsComponent, canActivate: [AdminGuard] },
          { path: 'audit', component: AdminAuditComponent, canActivate: [AdminGuard] },
        ],
      },
    ]),
    SharedModule,
    FormsModule
  ]
})
export class AdminModule {}
