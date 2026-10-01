/**
 * Shared design tokens for the Albums feature — loosely modelled on Material 3 /
 * Google Photos: a blue primary, tonal surfaces, and consistent radii/elevation
 * so every screen feels like one app instead of four different ones.
 */

export const colors = {
    primary: '#1a73e8',
    primaryContainer: '#e8f0fe',
    onPrimaryContainer: '#0b57cf',

    surface: '#ffffff',
    surfaceVariant: '#f1f3f4',
    surfaceContainer: '#f8f9fa',

    onSurface: '#202124',
    onSurfaceVariant: '#5f6368',
    outline: '#e0e2e5',

    error: '#d93025',
    errorContainer: '#fce8e6',

    scrim: 'rgba(0,0,0,0.5)',

    inverseSurface: '#2a2a2e',
    inverseOnSurface: '#f1f1f1',

    skeleton: '#e8eaed',
    skeletonHighlight: '#f4f5f6',
};

export const radii = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 28,
    full: 999,
};

export const elevation = {
    1: { elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
    2: { elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 4 },
    3: { elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.16, shadowRadius: 8 },
    4: { elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },
} as const;

/** Standard ripple for filled/light surfaces. */
export const ripple = { color: 'rgba(26,115,232,0.12)' };
/** Ripple for dark/hero surfaces (over photos). */
export const rippleOnDark = { color: 'rgba(255,255,255,0.24)' };
/** Ripple for destructive actions. */
export const rippleDestructive = { color: 'rgba(217,48,37,0.12)' };
