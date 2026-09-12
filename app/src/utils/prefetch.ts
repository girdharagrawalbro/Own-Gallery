import RNFS from 'react-native-fs';
import { getAccessToken } from '../storage/authStorage';
import { Media } from '../types/media';

export const prefetchThumbnails = async (mediaList: Media[]) => {
  try {
    const token = await getAccessToken();
    if (!token) return;

    for (const media of mediaList) {
      if (!media.thumbnail_url) continue;

      const safeFilename = encodeURIComponent(media.thumbnail_url);
      const cachePath = `${RNFS.CachesDirectoryPath}/${safeFilename}`;

      const exists = await RNFS.exists(cachePath);
      if (!exists) {
        // We do not await this promise so it prefetches in the background
        RNFS.downloadFile({
          fromUrl: media.thumbnail_url,
          toFile: cachePath,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }).promise.catch((err) => {
          console.log(`Failed to prefetch ${media.thumbnail_url}:`, err);
        });
      }
    }
  } catch (err) {
    console.log('Prefetch failed:', err);
  }
};
