import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Directory where uploaded images are persisted. In production this lives
 * inside the Railway-mounted `data` volume (same as the SQLite DB) so files
 * survive deploys and redeploys. In local dev it falls back to ./uploads
 * under the backend working directory.
 */
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  (process.env.NODE_ENV === 'production'
    ? '/data/uploads'
    : path.join(process.cwd(), 'uploads'));

/** Allowed upload MIME types mapped to their file extension. */
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Create the upload directory tree if it doesn't exist yet. */
export function ensureUploadDir(): void {
  fs.mkdirSync(path.join(UPLOAD_DIR, 'media'), { recursive: true });
}

/**
 * Persist an image buffer to disk, deduplicating by content hash.
 *
 * The file is named `<sha256>.<ext>`. Identical bytes always hash to the same
 * name, so re-uploading the same image simply returns the existing URL without
 * writing a duplicate file. Returns the URL the client should store/display.
 */
export function saveImage(
  buffer: Buffer,
  mimetype: string
): { url: string; key: string } {
  const ext = ALLOWED_MIME[mimetype];
  if (!ext) {
    throw new Error('Unsupported file type. Allowed: JPEG, PNG, WebP, GIF.');
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error('File too large. Maximum size is 10 MB.');
  }

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const key = `${hash}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, 'media', key);

  // Dedup: only write when the file doesn't already exist on disk.
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, buffer);
  }

  return { url: `/uploads/media/${key}`, key };
}
