import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: '',
    pathMatch: 'full'
  },
  {
    path: '',
    loadChildren: () => import('./features/landing/landing.module').then(m => m.LandingModule)
  },
  {
    path: 'login',
    loadChildren: () => import('./features/auth/auth.module').then(m => m.AuthModule)
  },
  {
    path: 'register',
    loadChildren: () => import('./features/auth/auth.module').then(m => m.AuthModule)
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./features/dashboard/dashboard.module').then(m => m.DashboardModule),
    data: { layout: 'authenticated' }
  },
  {
    path: 'messages',
    loadChildren: () => import('./features/messages/messages.module').then(m => m.MessagesModule),
    data: { layout: 'authenticated' }
  },
  {
    path: 'friends',
    loadChildren: () => import('./features/friends/friends.module').then(m => m.FriendsModule),
    data: { layout: 'authenticated' }
  },
  {
    path: 'profile',
    loadChildren: () => import('./features/profile/profile.module').then(m => m.ProfileModule),
    data: { layout: 'authenticated' }
  },
  {
    path: 'profile/:id',
    loadChildren: () => import('./features/profile/profile.module').then(m => m.ProfileModule),
    data: { layout: 'authenticated' }
  },
  {
    path: 'video',
    loadChildren: () => import('./features/video-chat/video-chat.module').then(m => m.VideoChatModule),
    data: { layout: 'authenticated' }
  },
  {
    path: 'discover',
    loadChildren: () => import('./features/discover/discover.module').then(m => m.DiscoverModule),
    data: { layout: 'authenticated' }
  },
  {
    path: 'settings',
    loadChildren: () => import('./features/settings/settings.module').then(m => m.SettingsModule),
    data: { layout: 'authenticated' }
  },
  {
    path: 'premium',
    loadChildren: () => import('./features/premium/premium.module').then(m => m.PremiumModule),
    data: { layout: 'authenticated' }
  },
  {
    path: 'about',
    loadChildren: () => import('./features/about/about.module').then(m => m.AboutModule)
  },
  {
    path: 'notifications',
    loadChildren: () => import('./features/notifications/notifications.module').then(m => m.NotificationsModule),
    data: { layout: 'authenticated' }
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forRoot(routes, {
      scrollPositionRestoration: 'enabled',
      anchorScrolling: 'enabled'
    })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
