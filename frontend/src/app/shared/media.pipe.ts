import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '@env/environment';

/**
 * Resolves a media path (server-stored upload) to a loadable URL.
 *
 * Uploaded images are stored as relative paths like `/uploads/media/<hash>.jpg`.
 * In production the API is served from the same origin, so the path is used as-is.
 * In local dev the API runs on a separate origin (http://localhost:3000), so we
 * prefix it with `environment.apiBase`. External URLs (e.g. pravatar/unsplash)
 * pass through unchanged.
 */
@Pipe({ name: 'media' })
export class MediaPipe implements PipeTransform {
  transform(url: string | null | undefined): string {
    if (!url) return '';
    if (url.startsWith('/uploads')) {
      return `${environment.apiBase}${url}`;
    }
    return url;
  }
}
