import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ToastAndroid } from 'react-native';
import { getMediaStatus, uploadMedia, permanentDelete } from '../api/media';
import { addMediaToAlbum } from '../api/albums';
import { Media } from '../types/media';
import { Asset } from 'react-native-image-picker';

export interface UploadTask {
    id: string; // The local URI serves as unique ID for the task
    fileName: string;
    uri: string;
    progress: number;
    status: 'uploading' | 'processing' | 'completed' | 'failed';
    error?: string;
    mediaId?: number; // Added once Django returns the Media object
}

interface UploadContextType {
    tasks: UploadTask[];
    uploadFiles: (assets: Asset[], albumId?: number) => void;
    clearCompletedTasks: () => void;
    cancelTask: (taskId: string) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const UploadProvider = ({ children }: { children: ReactNode }) => {
    const [tasks, setTasks] = useState<UploadTask[]>([]);

    // Polling effect for processing tasks
    useEffect(() => {
        const processingTasks = tasks.filter(t => t.status === 'processing' && t.mediaId);
        if (processingTasks.length === 0) return;

        const interval = setInterval(async () => {
            setTasks(currentTasks => {
                const nextTasks = [...currentTasks];
                return nextTasks; // State update deferred to the async loop below
            });

            for (const task of processingTasks) {
                try {
                    const status = await getMediaStatus(task.mediaId!);
                    setTasks(prev => prev.map(t => {
                        if (t.id === task.id) {
                            if (status.status === 'completed') {
                                ToastAndroid.show(`${t.fileName} completed`, ToastAndroid.SHORT);
                                return { ...t, status: 'completed' };
                            } else if (status.status === 'failed') {
                                ToastAndroid.show(`${t.fileName} failed to process`, ToastAndroid.SHORT);
                                return { ...t, status: 'failed', error: 'Processing failed on server' };
                            }
                        }
                        return t;
                    }));
                } catch (e) {
                    console.error("Failed to poll status for", task.mediaId);
                }
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [tasks]);

    const uploadFiles = async (assets: Asset[], albumId?: number) => {
        // 1. Add all to queue
        const newTasks: UploadTask[] = assets.map(asset => ({
            id: asset.uri!,
            uri: asset.uri!,
            fileName: asset.fileName || 'Unnamed file',
            progress: 0,
            status: 'uploading',
        }));

        setTasks(prev => [...prev, ...newTasks]);

        // 2. Process uploads (sequentially or in parallel, choosing sequential for stability)
        for (const asset of assets) {
            try {
                const newMedia = await uploadMedia(
                    asset.uri!,
                    asset.fileName || 'upload',
                    asset.type || 'application/octet-stream',
                    (event: any) => {
                        if (event.total) {
                            const prog = Math.round((event.loaded * 100) / event.total);
                            setTasks(prev => prev.map(t => 
                                t.id === asset.uri ? { ...t, progress: prog } : t
                            ));
                        }
                    },
                    asset.timestamp
                );

                if (albumId && newMedia && newMedia.id) {
                    await addMediaToAlbum(albumId, [newMedia.id]);
                }
                
                if (newMedia) {
                    setTasks(prev => prev.map(t => 
                        t.id === asset.uri ? { 
                            ...t, 
                            status: newMedia.status === 'completed' ? 'completed' : 'processing', 
                            mediaId: newMedia.id 
                        } : t
                    ));
                }
            } catch (err: any) {
                console.log('Upload error for', asset.fileName, err);
                setTasks(prev => prev.map(t => 
                    t.id === asset.uri ? { ...t, status: 'failed', error: 'Upload failed' } : t
                ));
            }
        }
    };

    const clearCompletedTasks = () => {
        setTasks(prev => prev.filter(t => t.status !== 'completed' && t.status !== 'failed'));
    };

    const cancelTask = async (taskId: string) => {
        // Find the task before removing it to check if we need to delete it from server
        const taskToCancel = tasks.find(t => t.id === taskId);
        
        // Remove it immediately from the UI
        setTasks(prev => prev.filter(t => t.id !== taskId));
        
        if (taskToCancel && taskToCancel.mediaId && taskToCancel.status === 'processing') {
            try {
                await permanentDelete(taskToCancel.mediaId);
                console.log(`Permanently deleted stuck media ${taskToCancel.mediaId}`);
            } catch (err) {
                console.error(`Failed to delete media ${taskToCancel.mediaId} on cancel`, err);
            }
        }
    };

    return (
        <UploadContext.Provider value={{ tasks, uploadFiles, clearCompletedTasks, cancelTask }}>
            {children}
        </UploadContext.Provider>
    );
};

export const useUploads = () => {
    const context = useContext(UploadContext);
    if (!context) {
        throw new Error('useUploads must be used within an UploadProvider');
    }
    return context;
};
