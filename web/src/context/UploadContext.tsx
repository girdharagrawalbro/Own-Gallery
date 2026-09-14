import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { UploadManager, isTerminal } from '../utils/uploadManager';
import { UploadActionsContext, UploadStateContext } from './uploads';
import type { UploadActions, UploadState } from './uploads';

const UPLOAD_ACCEPT = 'image/*,video/*,.heic,.heif,.mov,.mkv,.m4v,.3gp';

/**
 * App-wide upload queue (resumable chunked uploads). Actions and state live in separate
 * contexts so pages that only start uploads don't re-render on every progress tick.
 */
export const UploadProvider = ({ children }: { children: ReactNode }) => {
  const [manager] = useState(() => new UploadManager());
  const items = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const [mediaVersion, setMediaVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => manager.onCompleted(() => setMediaVersion((v) => v + 1)), [manager]);

  // Abort in-flight uploads when the provider unmounts (e.g. logout).
  useEffect(() => () => manager.dispose(), [manager]);

  // Warn before closing the tab while uploads are still running.
  const hasActive = items.some((i) => !isTerminal(i.status));
  useEffect(() => {
    if (!hasActive) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasActive]);

  const actions = useMemo<UploadActions>(
    () => ({
      addFiles: manager.addFiles,
      cancel: manager.cancel,
      cancelAll: manager.cancelAll,
      retry: manager.retry,
      clearFinished: manager.clearFinished,
      openFilePicker: () => inputRef.current?.click(),
      onCompleted: manager.onCompleted,
    }),
    [manager],
  );

  const state = useMemo<UploadState>(() => ({ items, mediaVersion }), [items, mediaVersion]);

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) manager.addFiles(Array.from(files));
    e.target.value = '';
  };

  return (
    <UploadActionsContext.Provider value={actions}>
      <UploadStateContext.Provider value={state}>
        {children}
        <input ref={inputRef} type="file" multiple accept={UPLOAD_ACCEPT} hidden onChange={onInputChange} />
      </UploadStateContext.Provider>
    </UploadActionsContext.Provider>
  );
};
