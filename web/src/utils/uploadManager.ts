import { api, getErrorMessage } from '../api/client';
import type { Media } from '../types/media';
import {
  isBrowserRenderableImage,
  isCancellation,
  mediaKindOf,
  pollUntilProcessed,
  uploadFileChunked,
} from './chunkedUpload';

export type UploadStatus = 'queued' | 'uploading' | 'processing' | 'completed' | 'duplicate' | 'failed' | 'cancelled';

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  kind: 'image' | 'video' | null;
  /** Object URL for a local preview (browser-renderable images only). */
  thumbUrl: string | null;
  status: UploadStatus;
  bytesUploaded: number;
  error: string | null;
  media: Media | null;
}

export const MAX_CONCURRENT_UPLOADS = 3;
const PROGRESS_THROTTLE_MS = 150;

const TERMINAL: ReadonlySet<UploadStatus> = new Set(['completed', 'duplicate', 'failed', 'cancelled']);
export const isTerminal = (status: UploadStatus) => TERMINAL.has(status);

interface Runtime {
  controller: AbortController;
  uploadId: string | null;
  lastProgressAt: number;
}

type Listener = () => void;
type CompletedListener = (media: Media) => void;

let nextId = 0;

/**
 * Framework-agnostic upload queue. React reads it via useSyncExternalStore.
 * Up to MAX_CONCURRENT_UPLOADS files transfer at once; processing polls don't hold a slot.
 */
export class UploadManager {
  private items: UploadItem[] = [];
  private files = new Map<string, File>();
  private queue: string[] = [];
  private active = new Set<string>();
  private runtime = new Map<string, Runtime>();
  private listeners = new Set<Listener>();
  private completedListeners = new Set<CompletedListener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): UploadItem[] => this.items;

  onCompleted = (listener: CompletedListener): (() => void) => {
    this.completedListeners.add(listener);
    return () => this.completedListeners.delete(listener);
  };

  addFiles = (files: Iterable<File>) => {
    const added: UploadItem[] = [];
    for (const file of files) {
      const id = `u${Date.now().toString(36)}-${nextId++}`;
      const kind = mediaKindOf(file);
      const item: UploadItem = {
        id,
        name: file.name,
        size: file.size,
        kind,
        thumbUrl: isBrowserRenderableImage(file) ? URL.createObjectURL(file) : null,
        status: kind ? 'queued' : 'failed',
        bytesUploaded: 0,
        error: kind ? null : 'Unsupported file type',
        media: null,
      };
      this.files.set(id, file);
      if (kind) this.queue.push(id);
      added.push(item);
    }
    if (added.length === 0) return;
    this.items = [...this.items, ...added];
    this.emit();
    this.pump();
  };

  cancel = (id: string) => {
    const item = this.find(id);
    if (!item || (item.status !== 'queued' && item.status !== 'uploading')) return;
    this.queue = this.queue.filter((q) => q !== id);
    const rt = this.runtime.get(id);
    if (rt) {
      rt.controller.abort();
      if (rt.uploadId) api.cancelUpload(rt.uploadId).catch(() => undefined);
    }
    this.update(id, { status: 'cancelled', error: null });
  };

  cancelAll = () => {
    for (const item of this.items) this.cancel(item.id);
  };

  retry = (id: string) => {
    const item = this.find(id);
    if (!item || !item.kind || (item.status !== 'failed' && item.status !== 'cancelled')) return;
    this.update(id, { status: 'queued', bytesUploaded: 0, error: null, media: null });
    this.queue.push(id);
    this.pump();
  };

  /** Remove finished rows (the panel's close button). */
  clearFinished = () => {
    const keep: UploadItem[] = [];
    for (const item of this.items) {
      if (isTerminal(item.status)) this.release(item);
      else keep.push(item);
    }
    this.items = keep;
    this.emit();
  };

  /** Abort everything (provider unmount / logout). */
  dispose = () => {
    for (const rt of this.runtime.values()) {
      rt.controller.abort();
      if (rt.uploadId) api.cancelUpload(rt.uploadId).catch(() => undefined);
    }
    for (const item of this.items) this.release(item);
    this.items = [];
    this.queue = [];
    this.active.clear();
    this.runtime.clear();
    this.emit();
  };

  private release(item: UploadItem) {
    if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
    this.files.delete(item.id);
  }

  private find(id: string) {
    return this.items.find((i) => i.id === id);
  }

  private update(id: string, patch: Partial<UploadItem>) {
    let changed = false;
    this.items = this.items.map((item) => {
      if (item.id !== id) return item;
      changed = true;
      return { ...item, ...patch };
    });
    if (changed) this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private pump() {
    while (this.active.size < MAX_CONCURRENT_UPLOADS && this.queue.length > 0) {
      const id = this.queue.shift()!;
      const file = this.files.get(id);
      if (!file) continue;
      this.active.add(id);
      void this.run(id, file);
    }
  }

  private async run(id: string, file: File) {
    const rt: Runtime = { controller: new AbortController(), uploadId: null, lastProgressAt: 0 };
    const { signal } = rt.controller;
    this.runtime.set(id, rt);
    this.update(id, { status: 'uploading', bytesUploaded: 0, error: null });

    const releaseSlot = () => {
      if (this.active.delete(id)) this.pump();
    };

    try {
      const created = await uploadFileChunked(file, {
        signal,
        onSession: (uploadId) => {
          rt.uploadId = uploadId;
        },
        onProgress: (bytes) => {
          const now = performance.now();
          if (bytes < file.size && now - rt.lastProgressAt < PROGRESS_THROTTLE_MS) return;
          rt.lastProgressAt = now;
          this.update(id, { bytesUploaded: bytes });
        },
      });

      // Bytes are on the server: free the transfer slot while it processes.
      rt.uploadId = null;
      releaseSlot();
      this.update(id, { status: 'processing', bytesUploaded: file.size, media: created });

      const final = created.status === 'processing' ? await pollUntilProcessed(created.id, signal) : created;
      if (final.status === 'completed') {
        this.update(id, { status: 'completed', media: final });
        for (const l of this.completedListeners) l(final);
      } else if (final.status === 'duplicate') {
        this.update(id, { status: 'duplicate', media: final });
      } else {
        this.update(id, { status: 'failed', media: final, error: final.upload_error || 'Processing failed' });
      }
    } catch (err) {
      if (isCancellation(err) || signal.aborted) {
        // cancel() already set the status (or we are being disposed).
      } else {
        this.update(id, { status: 'failed', error: getErrorMessage(err, 'Upload failed') });
      }
    } finally {
      this.runtime.delete(id);
      releaseSlot();
    }
  }
}
