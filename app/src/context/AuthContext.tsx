import React, {
    createContext,
    useContext,
    useEffect,
    useState,
} from 'react';

import {
    clearTokens,
    getAccessToken,
} from '../storage/authStorage';

import {
    setAuthFailureHandler,
} from '../api/client';
import { getMe, User } from '../api/auth';

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: User | null;
    setAuthenticated: (value: boolean) => void;
    setUser: (user: User | null) => void;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(
    undefined,
);

export const AuthProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {

    useEffect(() => {
        setAuthFailureHandler(() => {
            setIsAuthenticated(false);
        });
    }, []);

    const [isAuthenticated, setIsAuthenticated] =
        useState(false);

    const [isLoading, setIsLoading] =
        useState(true);

    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        checkAuthentication();
    }, []);

    const checkAuthentication = async () => {
        try {
            const token = await getAccessToken();
            if (token) {
                const userData = await getMe();
                setUser(userData);
                setIsAuthenticated(true);
            } else {
                setIsAuthenticated(false);
            }
        } catch (error) {
            console.error(
                'AUTH CHECK ERROR:',
                error,
            );
            setIsAuthenticated(false);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        await clearTokens();
        setIsAuthenticated(false);
        setUser(null);
    };

    return (
        <AuthContext.Provider
            value={{
                isAuthenticated,
                isLoading,
                user,
                setAuthenticated: setIsAuthenticated,
                setUser,
                logout,
            }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error(
            'useAuth must be used inside AuthProvider',
        );
    }

    return context;
};