import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableWithoutFeedback,
    Vibration,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, elevation, ripple, rippleDestructive } from './theme';
import { useTheme, ThemeColors } from '../../context/ThemeContext';

// ── Haptics ──────────────────────────────────────────────────────────────
// Kept dependency-free: a very short vibration reads as a "tick" on Android
// and is a no-op-ish blip on most devices, close enough to a haptic without
// requiring react-native-haptic-feedback to be installed. Swap this out for
// that library if it's already in the project for a crisper feel.
export const haptics = {
    tap: () => Vibration.vibrate(8),
    selectionStart: () => Vibration.vibrate(12),
};

// ── Bottom sheet menu ────────────────────────────────────────────────────
export interface BottomSheetMenuItem {
    key: string;
    label: string;
    icon?: React.ReactNode;
    destructive?: boolean;
    onPress: () => void;
}

interface BottomSheetMenuProps {
    visible: boolean;
    onClose: () => void;
    title?: string;
    items: BottomSheetMenuItem[];
}

export const BottomSheetMenu = ({ visible, onClose, title, items }: BottomSheetMenuProps) => {
    const { colors } = useTheme();
    const styles = React.useMemo(() => getStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
    const translateY = useRef(new Animated.Value(300)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const [mounted, setMounted] = useState(visible);

    useEffect(() => {
        if (visible) {
            setMounted(true);
            Animated.parallel([
                Animated.timing(backdropOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
                Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, mass: 0.9, stiffness: 180 }),
            ]).start();
        } else if (mounted) {
            Animated.parallel([
                Animated.timing(backdropOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
                Animated.timing(translateY, { toValue: 300, duration: 150, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
            ]).start(() => setMounted(false));
        }
    }, [visible]);

    if (!mounted) return null;

    return (
        <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
            <TouchableWithoutFeedback onPress={onClose}>
                <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} />
            </TouchableWithoutFeedback>
            <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 12, transform: [{ translateY }] }]}>
                <View style={styles.grabber} />
                {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
                {items.map(item => (
                    <Pressable
                        key={item.key}
                        onPress={() => { onClose(); item.onPress(); }}
                        android_ripple={item.destructive ? rippleDestructive : ripple}
                        style={styles.sheetItem}
                    >
                        {item.icon ? <View style={styles.sheetItemIcon}>{item.icon}</View> : null}
                        <Text style={[styles.sheetItemText, item.destructive && { color: colors.error }]}>{item.label}</Text>
                    </Pressable>
                ))}
            </Animated.View>
        </Modal>
    );
};

// ── Snackbar (with optional Undo) ───────────────────────────────────────
export interface SnackbarState {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
}

interface SnackbarProps {
    snackbar: SnackbarState | null;
    onDismiss: () => void;
    bottomOffset?: number;
    durationMs?: number;
}

export const Snackbar = ({ snackbar, onDismiss, bottomOffset = 24, durationMs = 4000 }: SnackbarProps) => {
    const { colors } = useTheme();
    const styles = React.useMemo(() => getStyles(colors), [colors]);
    const translateY = useRef(new Animated.Value(80)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (snackbar) {
            Animated.parallel([
                Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 16, stiffness: 200 }),
                Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
            ]).start();
            timerRef.current = setTimeout(() => onDismiss(), durationMs);
        } else {
            Animated.parallel([
                Animated.timing(translateY, { toValue: 80, duration: 150, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
            ]).start();
        }
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [snackbar]);

    if (!snackbar) return null;

    return (
        <Animated.View
            pointerEvents="box-none"
            style={[styles.snackbarWrap, { bottom: bottomOffset, opacity, transform: [{ translateY }] }]}
        >
            <View style={styles.snackbar}>
                <Text style={styles.snackbarText} numberOfLines={2}>{snackbar.message}</Text>
                {snackbar.actionLabel && snackbar.onAction && (
                    <Pressable
                        onPress={() => { snackbar.onAction?.(); onDismiss(); }}
                        android_ripple={{ color: 'rgba(138,180,248,0.24)' }}
                        style={styles.snackbarActionBtn}
                        hitSlop={8}
                    >
                        <Text style={styles.snackbarActionText}>{snackbar.actionLabel}</Text>
                    </Pressable>
                )}
            </View>
        </Animated.View>
    );
};

// ── Skeleton grid (loading placeholder) ─────────────────────────────────
const SkeletonPulse = ({ style }: { style: any }) => {
    const { colors } = useTheme();
    const skeletonColor = colors.surfaceVariant;
    const anim = useRef(new Animated.Value(0.4)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
                Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, []);
    return <Animated.View style={[style, { backgroundColor: skeletonColor, opacity: anim }]} />;
};

export const SkeletonGrid = ({ cellSize, columns = 2, rows = 3, style }: { cellSize: number; columns?: number; rows?: number; style?: any }) => (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 }, style]}>
        {Array.from({ length: columns * rows }).map((_, i) => (
            <View key={i} style={{ width: cellSize, margin: 8 }}>
                <SkeletonPulse style={{ width: cellSize, height: cellSize, borderRadius: radii.lg, marginBottom: 10 }} />
                <SkeletonPulse style={{ width: cellSize * 0.6, height: 12, borderRadius: radii.xs, marginBottom: 6 }} />
                <SkeletonPulse style={{ width: cellSize * 0.35, height: 10, borderRadius: radii.xs }} />
            </View>
        ))}
    </View>
);

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
        paddingTop: 10, ...elevation[4],
    },
    grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 8 },
    sheetTitle: { fontSize: 13, fontWeight: '600', color: colors.onSurfaceVariant, paddingHorizontal: 20, paddingVertical: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    sheetItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
    sheetItemIcon: { width: 28, marginRight: 16, alignItems: 'center' },
    sheetItemText: { fontSize: 16, color: colors.onSurface },

    snackbarWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
    snackbar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: colors.onSurface, borderRadius: radii.sm, paddingVertical: 14, paddingHorizontal: 16,
        minWidth: '100%', ...elevation[3],
    },
    snackbarText: { color: colors.surface, fontSize: 14, flex: 1, marginRight: 12 },
    snackbarActionBtn: { paddingVertical: 4, paddingHorizontal: 4 },
    snackbarActionText: { color: '#8ab4f8', fontSize: 14, fontWeight: '700', textTransform: 'uppercase' },
});
