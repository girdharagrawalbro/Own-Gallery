import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSettings, updateSettings } from '../api/settings';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeColors {
    primary: string;
    background: string;
    surface: string;
    surfaceVariant: string;
    onBackground: string;
    onSurface: string;
    onSurfaceVariant: string;
    border: string;
    error: string;
    card: string;
    text: string;
    notification: string;
}

export const lightColors: ThemeColors = {
    primary: '#1a73e8',
    background: '#ffffff',
    surface: '#ffffff',
    surfaceVariant: '#f1f3f4',
    onBackground: '#1c1b1f',
    onSurface: '#3c4043',
    onSurfaceVariant: '#5f6368',
    border: '#e0e2e5',
    error: '#d93025',
    card: '#ffffff',
    text: '#1c1b1f',
    notification: '#d93025',
};

export const darkColors: ThemeColors = {
    primary: '#8ab4f8',
    background: '#121212',
    surface: '#1e1e1e',
    surfaceVariant: '#303030',
    onBackground: '#e3e3e3',
    onSurface: '#e3e3e3',
    onSurfaceVariant: '#9aa0a6',
    border: '#444746',
    error: '#f28b82',
    card: '#1e1e1e',
    text: '#e3e3e3',
    notification: '#f28b82',
};

interface ThemeContextType {
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
    isDark: boolean;
    colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType>({
    mode: 'system',
    setMode: () => {},
    isDark: false,
    colors: lightColors,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemColorScheme = useColorScheme();
    const [mode, setModeState] = useState<ThemeMode>('system');
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        AsyncStorage.getItem('theme_mode').then((savedMode) => {
            if (savedMode) {
                setModeState(savedMode as ThemeMode);
            }
            setIsReady(true);
        });

        getSettings().then(settings => {
            if (settings.theme) {
                setModeState(settings.theme as ThemeMode);
                AsyncStorage.setItem('theme_mode', settings.theme);
            }
        }).catch(() => {});
    }, []);

    const setMode = (newMode: ThemeMode) => {
        setModeState(newMode);
        AsyncStorage.setItem('theme_mode', newMode);
        updateSettings({ theme: newMode }).catch(() => {});
    };

    const isDark = useMemo(() => {
        if (mode === 'system') return systemColorScheme === 'dark';
        return mode === 'dark';
    }, [mode, systemColorScheme]);

    const colors = isDark ? darkColors : lightColors;

    if (!isReady) return null;

    return (
        <ThemeContext.Provider value={{ mode, setMode, isDark, colors }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
