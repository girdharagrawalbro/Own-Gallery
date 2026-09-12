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

        console.log('LOGIN RESPONSE:', response.data);

        const { access, refresh } = response.data;

        console.log('Saving tokens...');

        await saveTokens(access, refresh);

        console.log('Tokens saved successfully');

        return response.data;
    } catch (error: any) {
        console.log('LOGIN FUNCTION ERROR:', error);
        console.log('ERROR RESPONSE:', error?.response?.data);
        console.log('ERROR MESSAGE:', error?.message);

        throw error;
    }
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