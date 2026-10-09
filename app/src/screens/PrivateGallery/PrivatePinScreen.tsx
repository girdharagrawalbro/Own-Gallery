import React, { useState, useEffect } from 'react';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Lock } from 'lucide-react-native';
import { getPrivatePinStatus, setPrivatePin, unlockPrivateGallery } from '../../api/auth';

const PrivatePinScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
    const navigation = useNavigation<any>();
    const [isSet, setIsSet] = useState<boolean | null>(null);
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        getPrivatePinStatus()
            .then(res => setIsSet(res.is_set))
            .catch(err => {
                Alert.alert('Error', 'Failed to check PIN status');
                navigation.goBack();
            })
            .finally(() => setLoading(false));
    }, []);

    const handleSubmit = async () => {
        if (!pin) return;
        if (pin.length < 6) {
            Alert.alert('Invalid PIN', 'PIN must be at least 6 characters long.');
            return;
        }

        setSubmitting(true);
        try {
            if (isSet) {
                // Unlock
                const res = await unlockPrivateGallery(pin);
                navigation.replace('PrivateGallery', { privateToken: res.private_token });
            } else {
                // Set
                if (pin !== confirmPin) {
                    Alert.alert('Error', 'PINs do not match.');
                    setSubmitting(false);
                    return;
                }
                await setPrivatePin(pin);
                Alert.alert('Success', 'Private PIN set successfully.');
                const res = await unlockPrivateGallery(pin);
                navigation.replace('PrivateGallery', { privateToken: res.private_token });
            }
        } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.error || err?.response?.data?.detail || 'An error occurred.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#1a73e8" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <ArrowLeft size={24} color={colors.onSurface} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Locked Folder</Text>
                </View>

                <View style={styles.content}>
                    <View style={styles.iconContainer}>
                        <Lock size={48} color="#1a73e8" />
                    </View>
                    <Text style={styles.title}>{isSet ? 'Enter PIN' : 'Set up Locked Folder'}</Text>
                    <Text style={styles.subtitle}>
                        {isSet
                            ? 'Enter your PIN to access your locked folder.'
                            : 'Set a PIN to protect your hidden photos and videos.'}
                    </Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Enter PIN"
                        secureTextEntry
                        keyboardType="number-pad"
                        maxLength={8}
                        value={pin}
                        onChangeText={setPin}
                        autoFocus
                    />

                    {!isSet && (
                        <TextInput
                            style={styles.input}
                            placeholder="Confirm PIN"
                            secureTextEntry
                            keyboardType="number-pad"
                            maxLength={8}
                            value={confirmPin}
                            onChangeText={setConfirmPin}
                        />
                    )}

                    <TouchableOpacity
                        style={[styles.btn, (!pin || (!isSet && !confirmPin) || submitting) && styles.btnDisabled]}
                        onPress={handleSubmit}
                        disabled={!pin || (!isSet && !confirmPin) || submitting}
                    >
                        {submitting ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.btnText}>{isSet ? 'Unlock' : 'Set PIN'}</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default PrivatePinScreen;

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    backBtn: { marginRight: 16 },
    headerTitle: { fontSize: 20, fontWeight: '500', color: '#1c1b1f' },
    content: { flex: 1, padding: 32, alignItems: 'center', paddingTop: 64 },
    iconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#e8f0fe', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
    title: { fontSize: 24, fontWeight: '600', color: '#1c1b1f', marginBottom: 12, textAlign: 'center' },
    subtitle: { fontSize: 16, color: colors.onSurfaceVariant, textAlign: 'center', marginBottom: 32, lineHeight: 24 },
    input: { width: '100%', height: 56, backgroundColor: '#f1f3f4', borderRadius: 8, paddingHorizontal: 16, fontSize: 18, marginBottom: 16, textAlign: 'center', letterSpacing: 4 },
    btn: { width: '100%', height: 50, backgroundColor: colors.primary, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
    btnDisabled: { backgroundColor: '#a8c7fa' },
    btnText: { color: colors.surface, fontSize: 16, fontWeight: '600' },
});
