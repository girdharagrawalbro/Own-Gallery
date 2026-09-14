import axios, { AxiosError } from 'axios';
import { api } from '../api/client';
import type { Media } from '../types/media';

export const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 1000;
const POLL_INTERVAL_MS = 3000;
const MAX_CONSECUTIVE_POLL_ERRORS = 20;

const EXTENSION_MIME: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  dng: 'image/x-adobe-dng',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  '3gp': 'video/3gpp',
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Browsers often report an empty type for HEIC/MKV/3GP; infer it from the extension. */
export function mimeTypeOf(file: File): string {
  return file.type || EXTENSION_MIME[extensionOf(file.name)] || 'application/octet-stream';
}

export function mediaKindOf(file: File): 'image' | 'video' | null {
  const mime = mimeTypeOf(file);
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return null;
}

/** Whether the browser can render this image directly (for the upload thumbnail). */
export function isBrowserRenderableImage(file: File): boolean {
  const mime = mimeTypeOf(file);
  return mime.startsWith('image/') && !/hei[cf]|dng/i.test(mime);
}

export class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadCancelledError';
  }
}

export function isCancellation(err: unknown): boolean {
  return err instanceof UploadCancelledError || axios.isCancel(err) || (err instanceof AxiosError && err.code === 'ERR_CANCELED');
}

/** Network errors, timeouts and 5xx (plus 408/429) are worth retrying. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof AxiosError) || isCancellation(err)) return false;
  const status = err.response?.status;
  if (status === undefined) return true;
  return status >= 500 || status === 408 || status === 429;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new UploadCancelledError());
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new UploadCancelledError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function withRetry<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    if (signal.aborted) throw new UploadCancelledError();
    try {
      return await fn();
    } catch (err) {
      if (signal.aborted || isCancellation(err)) throw new UploadCancelledError();
      if (attempt >= MAX_ATTEMPTS || !isRetryable(err)) throw err;
      const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
      await sleep(backoff + Math.random() * 300, signal);
    }
  }
}

export interface ChunkedUploadHooks {
  signal: AbortSignal;
  /** Called once the server session exists (needed to DELETE on cancel). */
  onSession: (uploadId: string) => void;
  /** Total bytes of the file confirmed or in flight. */
  onProgress: (bytesUploaded: number) => void;
}

/**
 * Resumable chunked upload: create session, PUT chunks sequentially with retry + exponential
 * backoff, then complete. Resolves with the Media returned by /complete/ (usually "processing").
 */
export async function uploadFileChunked(file: File, hooks: ChunkedUploadHooks): Promise<Media> {
  const { signal, onSession, onProgress } = hooks;

  const session = await withRetry(
    () =>
      api.createUpload(
        {
          filename: file.name,
          file_size: file.size,
          mime_type: mimeTypeOf(file),
          client_timestamp: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
        },
        signal,
      ),
    signal,
  );
  onSession(session.upload_id);

  const { chunk_size: chunkSize, total_chunks: totalChunks } = session;
  const chunkLength = (index: number) => Math.min(file.size, (index + 1) * chunkSize) - index * chunkSize;

  const sendChunk = (index: number, bytesBefore: number) =>
    withRetry(
      () =>
        api.uploadChunk(session.upload_id, index, file.slice(index * chunkSize, (index + 1) * chunkSize), {
          signal,
          onProgress: (loaded) => onProgress(bytesBefore + Math.min(loaded, chunkLength(index))),
        }),
      signal,
    );

  let uploaded = 0;
  for (let index = 0; index < totalChunks; index++) {
    await sendChunk(index, uploaded);
    uploaded += chunkLength(index);
    onProgress(uploaded);
  }

  // Complete; if the server reports missing chunks, resend them (twice at most).
  for (let round = 0; ; round++) {
    try {
      return await withRetry(() => api.completeUpload(session.upload_id, signal), signal);
    } catch (err) {
      const missing = (err instanceof AxiosError && err.response?.status === 400
        ? (err.response.data as { missing_chunks?: unknown })?.missing_chunks
        : undefined);
      if (!Array.isArray(missing) || missing.length === 0 || round >= 2) throw err;
      for (const index of missing) {
        if (typeof index === 'number') await sendChunk(index, uploaded - chunkLength(index));
      }
    }
  }
}

/** Poll GET /media/{id}/ until processing finishes. Transient errors are tolerated. */
export async function pollUntilProcessed(mediaId: number, signal: AbortSignal): Promise<Media> {
  let consecutiveErrors = 0;
  for (;;) {
    await sleep(POLL_INTERVAL_MS, signal);
    try {
      const media = await api.getMedia(mediaId, signal);
      consecutiveErrors = 0;
      if (media.status !== 'processing') return media;
    } catch (err) {
      if (signal.aborted || isCancellation(err)) throw new UploadCancelledError();
      if (err instanceof AxiosError && err.response?.status === 404) throw err;
      if (++consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) throw err;
    }
  }
}
