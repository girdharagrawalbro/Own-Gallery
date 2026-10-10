import { Platform, Vibration } from 'react-native';

const triggerVibration = (pattern: number | number[]) => {
    try {
        Vibration.vibrate(pattern);
    } catch (e) {
        // Ignore errors on devices without vibrator support
        console.warn('Vibration not supported on this device');
    }
};

export const hapticSelection = () => {
    // A very short, light vibration for selection/toggles
    if (Platform.OS === 'android') {
        triggerVibration(20);
    } else {
        triggerVibration(400); // iOS defaults to standard vibration if haptics aren't linked
    }
};

export const hapticSuccess = () => {
    // A pleasant double-pulse for success (like adding to favorites)
    if (Platform.OS === 'android') {
        triggerVibration([0, 30, 80, 30]);
    } else {
        triggerVibration(400);
    }
};

export const hapticWarning = () => {
    // A heavier, longer vibration for warning (like deleting)
    if (Platform.OS === 'android') {
        triggerVibration(80);
    } else {
        triggerVibration(400);
    }
};
