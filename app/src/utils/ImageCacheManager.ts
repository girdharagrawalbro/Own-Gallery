import RNFS from 'react-native-fs';

const CACHE_DIR = `${RNFS.CachesDirectoryPath}/own_gallery_thumbs`;

// Simple string hashing function for filenames
const hashCode = (str: string): string => {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(36);
};

// Ensure cache directory exists
const ensureDirExists = async () => {
  const exists = await RNFS.exists(CACHE_DIR);
  if (!exists) {
    await RNFS.mkdir(CACHE_DIR);
  }
};

export const ImageCacheManager = {
  /**
   * Fetches an image, caching it locally to disk if not already cached.
   * Returns a local file:// URI that can be rendered immediately without auth.
   */
  getCachedImage: async (url: string, token: string): Promise<string> => {
    try {
      await ensureDirExists();
      
      const fileName = `${hashCode(url)}.jpg`; // Assuming thumbnails are JPEG
      const localFilePath = `${CACHE_DIR}/${fileName}`;
      
      const fileExists = await RNFS.exists(localFilePath);
      
      if (fileExists) {
        // Return local file URI
        return `file://${localFilePath}`;
      }

      // Download file to cache
      const options: RNFS.DownloadFileOptions = {
        fromUrl: url,
        toFile: localFilePath,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };

      const result = await RNFS.downloadFile(options).promise;

      if (result.statusCode === 200) {
        return `file://${localFilePath}`;
      } else {
        // Download failed (e.g. 404, 401)
        if (await RNFS.exists(localFilePath)) {
           await RNFS.unlink(localFilePath);
        }
        throw new Error(`Failed to download image, status code: ${result.statusCode}`);
      }
    } catch (error) {
      console.warn('ImageCacheManager Error:', error);
      throw error;
    }
  },

  /**
   * Clears the entire thumbnail cache
   */
  clearCache: async (): Promise<void> => {
    try {
      const exists = await RNFS.exists(CACHE_DIR);
      if (exists) {
        await RNFS.unlink(CACHE_DIR);
      }
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }
};
