import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type BackupStatus = {
  enabled: boolean;
  wifiOnly: boolean;
  chargingOnly: boolean;
  signedIn: boolean;
  permissionGranted: boolean;
  /** 'off' | 'scheduled' | 'running' */
  state: string;
  lastRunAt: number;
  lastSuccessAt: number;
  /** '' | 'up_to_date' | 'paused' | 'error' | 'sign_in_required' | 'permission_required' */
  lastResult: string;
  lastError: string;
  backedUpCount: number;
  skippedCount: number;
};

/**
 * Android-only native module for media transfer:
 * - Auto Backup: scheduling and uploading run natively in WorkManager; JS only configures it.
 * - Manual uploads: resumable chunked uploads that stream the file natively (progress is emitted
 *   as `OwnGalleryUploadProgress` device events: { taskId, loaded, total }).
 */
export interface Spec extends TurboModule {
  configure(apiBaseUrl: string): void;
  setAuthTokens(accessToken: string, refreshToken: string): void;
  clearAuth(): Promise<void>;
  setSettings(enabled: boolean, wifiOnly: boolean, chargingOnly: boolean): Promise<void>;
  getStatus(): Promise<BackupStatus>;
  runNow(): Promise<void>;

  /** Resolves with the created Media object as a JSON string. */
  uploadFile(taskId: string, uri: string, fileName: string, mimeType: string, clientTimestamp: string): Promise<string>;
  cancelUpload(taskId: string): void;
}

export default TurboModuleRegistry.get<Spec>('OwnGalleryMediaSync');
