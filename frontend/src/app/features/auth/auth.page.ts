import { Component } from '@angular/core';

@Component({
  selector: 'pulse-auth',
  templateUrl: './auth.page.html',
  styleUrls: ['./auth.page.scss']
})
export class AuthPageComponent {
  mode: 'login' | 'register' = 'login';
}
