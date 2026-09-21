import { useState, useCallback, useRef } from 'react';
import { CameraRoll, PhotoIdentifier } from '@react-native-camera-roll/camera-roll';
import { requestMediaAccess } from '../services/AutoBackupService';
import { Media } from '../types/media';

/** 
 * Simple hash function to generate a negative integer ID for local files,
 * ensuring they don't collide with backend positive IDs.
 */
function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return -Math.abs(hash || 1); // always negative
}

export const mapCameraRollNodeToMedia = (node: PhotoIdentifier['node']): Media => {
  const { image, type, timestamp } = node;
  const isVideo = type.startsWith('video');
  const dateIso = new Date(timestamp * 1000).toISOString();
  
  // Use filepath or uri for the name if filename is missing
  let filename = image.filename;
  if (!filename) {
    const parts = (image.filepath || image.uri).split('/');
    filename = parts[parts.length - 1];
  }

  // CameraRoll gives us a content URI which can be read by Image/Video components.
  const uri = image.uri;
  
  return {
    id: hashStringToInt(uri),
    media_type: isVideo ? 'video' : 'image',
    filename: filename || 'unknown',
    mime_type: type,
    file_size: image.fileSize || 0,
    width: image.width,
    height: image.height,
    duration: isVideo ? image.playableDuration : null,
    is_favorite: false,
    status: 'completed', // It's local, so it's "completed" as far as existence goes
    upload_error: null,
    taken_at: dateIso,
    created_at: dateIso,
    updated_at: dateIso,
    thumbnail_url: uri,
    preview_url: uri,
    content_url: uri,
    download_url: uri,
    // Add a custom property to mark this as local-only for the UI. 
    // Typescript might complain since it's not in Media type, we'll cast it later or just check if id < 0.
    _isLocal: true,
  } as Media & { _isLocal?: boolean };
};

export const useLocalMedia = () => {
  const [localMedia, setLocalMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  const endCursor = useRef<string | undefined>(undefined);
  const isFetching = useRef(false);

  const fetchNextPage = useCallback(async (reset = false) => {
    if (isFetching.current) return;
    if (!reset && !hasMore) return;

    try {
      isFetching.current = true;
      setLoading(true);

      const access = await requestMediaAccess();
      if (access === 'denied') {
        setHasMore(false);
        return;
      }

      if (reset) {
        endCursor.current = undefined;
        setLocalMedia([]);
      }

      const page = await CameraRoll.getPhotos({
        first: 100,
        after: endCursor.current,
        assetType: 'All',
        include: ['filename', 'fileSize', 'imageSize', 'playableDuration'],
      });

      const newMedia = page.edges.map(e => mapCameraRollNodeToMedia(e.node));

      setLocalMedia(prev => reset ? newMedia : [...prev, ...newMedia]);
      endCursor.current = page.page_info.end_cursor;
      setHasMore(page.page_info.has_next_page);
    } catch (err) {
      console.warn('Failed to fetch local media:', err);
    } finally {
      isFetching.current = false;
      setLoading(false);
    }
  }, [hasMore]);

  const refresh = useCallback(() => fetchNextPage(true), [fetchNextPage]);

  return {
    localMedia,
    loading,
    hasMore,
    fetchNextPage,
    refresh,
  };
};
