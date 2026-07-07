import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PremiumModalService {
  private openSubject = new BehaviorSubject<boolean>(false);

  get open$(): Observable<boolean> {
    return this.openSubject.asObservable();
  }

  open(): void {
    this.openSubject.next(true);
  }

  close(): void {
    this.openSubject.next(false);
  }
}
