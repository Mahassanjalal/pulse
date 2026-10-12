import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '@env/environment';

export type ReportCategory =
  | 'NUDITY'
  | 'HARASSMENT'
  | 'HATE_SPEECH'
  | 'VIOLENCE'
  | 'FAKE_PROFILE'
  | 'SPAM'
  | 'UNDERAGE'
  | 'OFFENSIVE'
  | 'SCAMS'
  | 'OTHER';

export const REPORT_CATEGORIES: { id: ReportCategory; label: string }[] = [
  { id: 'NUDITY', label: 'Nudity or sexual content' },
  { id: 'UNDERAGE', label: 'Suspected minor' },
  { id: 'HARASSMENT', label: 'Harassment or bullying' },
  { id: 'HATE_SPEECH', label: 'Hate speech' },
  { id: 'VIOLENCE', label: 'Violence or threats' },
  { id: 'SCAMS', label: 'Scam or fraud' },
  { id: 'FAKE_PROFILE', label: 'Fake profile' },
  { id: 'SPAM', label: 'Spam' },
  { id: 'OFFENSIVE', label: 'Other offensive behavior' },
  { id: 'OTHER', label: 'Something else' },
];

/**
 * Safety actions available during a live call (App Store Guideline 1.2 and
 * Google Play UGC policy require in-app reporting + blocking — audit finding
 * C7: the /video page previously exposed neither).
 */
@Injectable({ providedIn: 'root' })
export class ReportService {
  constructor(private http: HttpClient) {}

  async report(userId: string, category: ReportCategory, description: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/reports`, {
        reportedUserId: userId,
        category,
        description,
      })
    );
  }

  async block(userId: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/users/block`, { userId })
    );
  }
}
