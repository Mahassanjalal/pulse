import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '@env/environment';

export type UploadCategory = 'avatar' | 'cover' | 'message';

interface UploadResponse {
  url: string;
}

@Injectable({ providedIn: 'root' })
export class MediaService {
  constructor(private http: HttpClient) {}

  /**
   * Upload an image file to the server and return its stored URL.
   * The server deduplicates identical bytes, so re-uploading the same image
   * returns the same URL without creating a duplicate file on disk.
   */
  upload(file: File, _category: UploadCategory): Observable<UploadResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http
      .post<UploadResponse>(`${environment.apiUrl}/uploads`, form)
      .pipe(
        catchError((err: HttpErrorResponse) =>
          throwError(() => new Error(err.error?.error || 'Upload failed'))
        )
      );
  }
}
