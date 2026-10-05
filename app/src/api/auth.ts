import { api } from './client';
import { saveTokens } from '../storage/authStorage';

interface LoginResponse {
    access: string;
    refresh: string;
}

export const login = async (
    username: string,
    password: string,
): Promise<LoginResponse> => {
    try {
        const response = await api.post<LoginResponse>(
            '/auth/login/',
            {
                username,
                password,
            },
        );

        const { access, refresh } = response.data;

        await saveTokens(access, refresh);

        return response.data;
    } catch (error: any) {
        throw error;
    }
};

export const register = async (
    username: string,
    email: string,
    password: string,
): Promise<any> => {
    const response = await api.post('/auth/register/', {
        username,
        email,
        password,
    });
    return response.data;
};

export interface User {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    profile_image: string | null;
}

export const getMe = async (): Promise<User> => {
    const response = await api.get<User>('/auth/me/');
    return response.data;
};

export const updateProfile = async (data: Partial<User>): Promise<User> => {
    const response = await api.put<User>('/auth/me/', data);
    return response.data;
};

export const changePassword = async (data: any): Promise<void> => {
    await api.post('/auth/change-password/', data);
};

export const googleLogin = async (authCode: string): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>('/auth/google/', { auth_code: authCode });
    const { access, refresh } = response.data;
    await saveTokens(access, refresh);
    return response.data;
};

export const startGoogleSync = async (): Promise<void> => {
    await api.post('/auth/google/sync/');
};

// Private Gallery
export const getPrivatePinStatus = async (): Promise<{ is_set: boolean }> => {
    const response = await api.get<{ is_set: boolean }>('/auth/private-pin/status/');
    return response.data;
};

export const setPrivatePin = async (newPin: string, currentPin?: string): Promise<any> => {
    const response = await api.post('/auth/private-pin/set/', { new_pin: newPin, current_pin: currentPin });
    return response.data;
};

export const unlockPrivateGallery = async (pin: string): Promise<{ private_token: string }> => {
    const response = await api.post<{ private_token: string }>('/auth/private-pin/unlock/', { pin });
    return response.data;
};