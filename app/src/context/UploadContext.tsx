import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { ToastAndroid } from 'react-native';
import { Asset } from 'react-native-image-picker';
import {
    getMediaStatuses,
    isChunkedUploadAvailable,
    permanentDelete,
    uploadMedia,
    uploadMediaChunked,
    UploadCancelledError,
    UploadProgressEvent,
} from '../api/media';
import { addMediaToAlbum } from '../api/albums';
import { Media } from '../types/media';

const MAX_CONCURRENT_UPLOADS = 2;
// Processing status is polled for all uploads in one request, backing off while nothing changes.
const POLL_MIN_INTERVAL_MS = 2000;
const POLL_MAX_INTERVAL_MS = 15000;

export type UploadTaskStatus =
    | 'queued'
    | 'uploading'
    | 'processing'
    | 'completed'
    | 'duplicate'
    | 'failed';

export interface UploadTask {
    /** Unique per task, even if the same file is picked twice. */
    id: string;
    fileName: string;
    uri: string;
    mimeType: string;
    timestamp?: string;
    albumId?: number;
    progress: number;
    status: UploadTaskStatus;
    error?: string;
    /** Set once the server returns the Media object. */
    mediaId?: number;
}

export const isActiveUpload = (t: UploadTask) =>
    t.status === 'queued' || t.status === 'uploading' || t.status === 'processing';

export const isFinishedUpload = (t: UploadTask) =>
    t.status === 'completed' || t.status === 'duplicate' || t.status === 'failed';

interface UploadActions {
    uploadFiles: (assets: Asset[], albumId?: number) => void;
    retryTask: (taskId: string) => void;
    retryAllFailed: () => void;
    cancelTask: (taskId: string) => void;
    clearCompletedTasks: () => void;
    /** Increments whenever an upload finishes successfully (use it to refresh lists). */
    completedVersion: number;
}

const UploadStateContext = createContext<UploadTask[] | undefined>(undefined);
const UploadActionsContext = createContext<UploadActions | undefined>(undefined);

let taskCounter = 0;
const newTaskId = () => `${Date.now().toString(36)}-${(taskCounter++).toString(36)}`;

const errorMessage = (err: any): string =>
    (err?.code && err?.message && err.code !== 'UPLOAD_FAILED' ? err.message : null) ||
    err?.response?.data?.error ||
    err?.response?.data?.detail ||
    (err?.message === 'Network Error' ? 'Network error' : null) ||
    'Upload failed';

export const UploadProvider = ({ children }: { children: ReactNode }) => {
    const [tasks, setTasks] = useState<UploadTask[]>([]);
    const [completedVersion, setCompletedVersion] = useState(0);

    // Source of truth lives in a ref so async workers never read stale state.
    const tasksRef = useRef<UploadTask[]>([]);
    const queueRef = useRef<string[]>([]);
    const activeCountRef = useRef(0);
    const controllersRef = useRef(new Map<string, AbortController>());
    const lastPercentRef = useRef(new Map<string, number>());
    const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pollDelayRef = useRef(POLL_MIN_INTERVAL_MS);
    const pollInFlightRef = useRef(false);
    const mountedRef = useRef(true);

    const commit = useCallback((updater: (prev: UploadTask[]) => UploadTask[]) => {
        tasksRef.current = updater(tasksRef.current);
        if (mountedRef.current) {
            setTasks(tasksRef.current);
        }
    }, []);

    const patchTask = useCallback((id: string, patch: Partial<UploadTask>) => {
        commit(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
    }, [commit]);

    // ── Status polling: one interval, never overlapping, stops when idle ─────

    const stopPolling = useCallback(() => {
        if (pollTimerRef.current) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);

    const applyServerStatus = useCallback((taskId: string, media: Media) => {
        const task = tasksRef.current.find(t => t.id === taskId);
        if (!task) { return; }
        if (media.status === 'completed') {
            patchTask(taskId, { status: 'completed', progress: 100, mediaId: media.id });
            setCompletedVersion(v => v + 1);
        } else if (media.status === 'duplicate') {
            patchTask(taskId, { status: 'duplicate', progress: 100, mediaId: media.id });
        } else if (media.status === 'failed') {
            patchTask(taskId, {
                status: 'failed',
                mediaId: media.id,
                error: media.upload_error || 'Processing failed on server',
            });
            ToastAndroid.show(`${task.fileName} failed to process`, ToastAndroid.SHORT);
        } else if (task.status !== 'processing' || task.mediaId !== media.id) {
            patchTask(taskId, { status: 'processing', progress: 100, mediaId: media.id });
        }
    }, [patchTask]);

    const pollOnce = useCallback(async (): Promise<boolean> => {
        const processing = tasksRef.current.filter(t => t.status === 'processing' && t.mediaId);
        if (processing.length === 0) { return false; }
        let changed = false;
        try {
            const results = await getMediaStatuses(processing.map(t => t.mediaId!));
            const byId = new Map(results.map(m => [m.id, m]));
            for (const task of processing) {
                const media = byId.get(task.mediaId!);
                if (media && media.status !== 'processing') {
                    applyServerStatus(task.id, media);
                    changed = true;
                }
            }
        } catch (e) {
            console.error('Failed to poll upload status', e);
        }
        return changed;
    }, [applyServerStatus]);

    const schedulePoll = useCallback((delay: number) => {
        stopPolling();
        pollTimerRef.current = setTimeout(async () => {
            pollTimerRef.current = null;
            if (pollInFlightRef.current) { return; }
            pollInFlightRef.current = true;
            let changed = false;
            try {
                changed = await pollOnce();
            } finally {
                pollInFlightRef.current = false;
            }
            if (!mountedRef.current) { return; }
            if (!tasksRef.current.some(t => t.status === 'processing' && t.mediaId)) { return; }
            pollDelayRef.current = changed
                ? POLL_MIN_INTERVAL_MS
                : Math.min(Math.round(pollDelayRef.current * 1.5), POLL_MAX_INTERVAL_MS);
            schedulePoll(pollDelayRef.current);
        }, delay);
    }, [pollOnce, stopPolling]);

    const ensurePolling = useCallback(() => {
        // A new processing item restarts the fast cadence.
        pollDelayRef.current = POLL_MIN_INTERVAL_MS;
        if (!pollTimerRef.current && !pollInFlightRef.current) {
            schedulePoll(POLL_MIN_INTERVAL_MS);
        }
    }, [schedulePoll]);

    // ── Upload worker pool ───────────────────────────────────────────────────

    const runTask = useCallback(async (taskId: string) => {
        const task = tasksRef.current.find(t => t.id === taskId);
        if (!task) { return; }

        const controller = new AbortController();
        controllersRef.current.set(taskId, controller);
        lastPercentRef.current.set(taskId, 0);
        patchTask(taskId, { status: 'uploading', progress: 0, error: undefined });

        const onProgress = (event: UploadProgressEvent) => {
            if (!event.total) { return; }
            const percent = Math.min(99, Math.floor((event.loaded * 100) / event.total));
            // Only re-render when the integer percentage changes.
            if (lastPercentRef.current.get(taskId) === percent) { return; }
            lastPercentRef.current.set(taskId, percent);
            patchTask(taskId, { progress: percent });
        };

        try {
            const upload = isChunkedUploadAvailable ? uploadMediaChunked : uploadMedia;
            const media = await upload(
                task.uri,
                task.fileName,
                task.mimeType,
                onProgress,
                task.timestamp,
                controller.signal,
            );

            if (!tasksRef.current.some(t => t.id === taskId)) {
                return; // cancelled while finishing
            }

            if (task.albumId && media?.id && media.status !== 'failed' && media.status !== 'duplicate') {
                try {
                    await addMediaToAlbum(task.albumId, [media.id]);
                } catch (e) {
                    console.error('Failed to add uploaded media to album', e);
                }
            }

            if (media.status === 'processing') {
                patchTask(taskId, { status: 'processing', progress: 100, mediaId: media.id });
                ensurePolling();
            } else {
                applyServerStatus(taskId, media);
            }
        } catch (err: any) {
            if (controller.signal.aborted || err?.name === 'CanceledError' || err instanceof UploadCancelledError) {
                return;
            }
            console.error('Upload error for', task.fileName, err?.message);
            patchTask(taskId, { status: 'failed', error: errorMessage(err) });
        } finally {
            controllersRef.current.delete(taskId);
            lastPercentRef.current.delete(taskId);
        }
    }, [applyServerStatus, ensurePolling, patchTask]);

    const pump = useCallback(() => {
        while (activeCountRef.current < MAX_CONCURRENT_UPLOADS && queueRef.current.length > 0) {
            const nextId = queueRef.current.shift()!;
            if (!tasksRef.current.some(t => t.id === nextId && t.status === 'queued')) {
                continue;
            }
            activeCountRef.current += 1;
            runTask(nextId).finally(() => {
                activeCountRef.current -= 1;
                pump();
            });
        }
    }, [runTask]);

    // ── Public actions ───────────────────────────────────────────────────────

    const uploadFiles = useCallback((assets: Asset[], albumId?: number) => {
        const newTasks: UploadTask[] = assets
            .filter(a => !!a.uri)
            .map(asset => ({
                id: newTaskId(),
                uri: asset.uri!,
                fileName: asset.fileName || 'upload',
                mimeType: asset.type || 'application/octet-stream',
                timestamp: asset.timestamp,
                albumId,
                progress: 0,
                status: 'queued' as const,
            }));
        if (newTasks.length === 0) { return; }

        commit(prev => [...prev, ...newTasks]);
        queueRef.current.push(...newTasks.map(t => t.id));
        pump();
    }, [commit, pump]);

    const retryTask = useCallback((taskId: string) => {
        const task = tasksRef.current.find(t => t.id === taskId);
        if (!task || task.status !== 'failed') { return; }
        patchTask(taskId, { status: 'queued', progress: 0, error: undefined, mediaId: undefined });
        queueRef.current.push(taskId);
        pump();
    }, [patchTask, pump]);

    const retryAllFailed = useCallback(() => {
        tasksRef.current.filter(t => t.status === 'failed').forEach(t => retryTask(t.id));
    }, [retryTask]);

    const cancelTask = useCallback((taskId: string) => {
        const task = tasksRef.current.find(t => t.id === taskId);
        commit(prev => prev.filter(t => t.id !== taskId));
        queueRef.current = queueRef.current.filter(id => id !== taskId);
        controllersRef.current.get(taskId)?.abort();

        if (task?.mediaId && task.status === 'processing') {
            permanentDelete(task.mediaId).catch(err => {
                console.error(`Failed to delete media ${task.mediaId} on cancel`, err);
            });
        }
    }, [commit]);

    const clearCompletedTasks = useCallback(() => {
        commit(prev => prev.filter(t => !isFinishedUpload(t)));
    }, [commit]);

    useEffect(() => {
        mountedRef.current = true;
        const controllers = controllersRef.current;
        return () => {
            mountedRef.current = false;
            stopPolling();
            controllers.forEach(c => c.abort());
        };
    }, [stopPolling]);

    const actions = useMemo<UploadActions>(() => ({
        uploadFiles,
        retryTask,
        retryAllFailed,
        cancelTask,
        clearCompletedTasks,
        completedVersion,
    }), [uploadFiles, retryTask, retryAllFailed, cancelTask, clearCompletedTasks, completedVersion]);

    return (
        <UploadActionsContext.Provider value={actions}>
            <UploadStateContext.Provider value={tasks}>
                {children}
            </UploadStateContext.Provider>
        </UploadActionsContext.Provider>
    );
};

/** Actions only: does not re-render on upload progress. */
export const useUploadActions = () => {
    const context = useContext(UploadActionsContext);
    if (!context) {
        throw new Error('useUploadActions must be used within an UploadProvider');
    }
    return context;
};

/** Tasks + actions (re-renders on every progress change). */
export const useUploads = () => {
    const tasks = useContext(UploadStateContext);
    const actions = useUploadActions();
    if (!tasks) {
        throw new Error('useUploads must be used within an UploadProvider');
    }
    return { tasks, ...actions };
};
