import apiClient from './client';

export interface UserSettings {
  theme: 'system' | 'light' | 'dark';
  grid_columns: number;
  backup_enabled: boolean;
  backup_wifi_only: boolean;
  backup_charging_only: boolean;
  backup_folders: any[];
}

export const getSettings = async (): Promise<UserSettings> => {
  const response = await apiClient.get('/auth/settings/');
  return response.data;
};

export const updateSettings = async (settings: Partial<UserSettings>): Promise<UserSettings> => {
  const response = await apiClient.patch('/auth/settings/', settings);
  return response.data;
};
