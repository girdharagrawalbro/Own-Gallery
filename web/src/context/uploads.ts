import { createContext, useContext, useEffect, useRef } from 'react';
import type { Media } from '../types/media';
import type { UploadItem } from '../utils/uploadManager';

/** Stable callbacks: consuming this never re-renders on upload progress. */
export interface UploadActions {
  addFiles: (files: Iterable<File>) => void;
  cancel: (id: string) => void;
  cancelAll: () => void;
  retry: (id: string) => void;
  clearFinished: () => void;
  openFilePicker: () => void;
  onCompleted: (listener: (media: Media) => void) => () => void;
}

/** Fast-changing state for the upload panel. */
export interface UploadState {
  items: UploadItem[];
  /** Incremented every time an upload finishes processing successfully. */
  mediaVersion: number;
}

export const UploadActionsContext = createContext<UploadActions | undefined>(undefined);
export const UploadStateContext = createContext<UploadState | undefined>(undefined);

export function useUploadActions(): UploadActions {
  const ctx = useContext(UploadActionsContext);
  if (!ctx) throw new Error('useUploadActions must be used within an UploadProvider');
  return ctx;
}

export function useUploadState(): UploadState {
  const ctx = useContext(UploadStateContext);
  if (!ctx) throw new Error('useUploadState must be used within an UploadProvider');
  return ctx;
}

/** Run `callback` for each upload that completes, without re-subscribing on every render. */
export function useUploadCompleted(callback: (media: Media) => void) {
  const { onCompleted } = useUploadActions();
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  useEffect(() => onCompleted((media) => callbackRef.current(media)), [onCompleted]);
}
