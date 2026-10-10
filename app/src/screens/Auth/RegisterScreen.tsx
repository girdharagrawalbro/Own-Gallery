import React, { useState } from 'react';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    ToastAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { login, register, googleLogin } from '../../api/auth';
import { GoogleIcon } from '../../components/GoogleIcon';
import { useAuth } from '../../context/AuthContext';

interface RegisterScreenProps {
    onSwitchToLogin: () => void;
}

const RegisterScreen: React.FC<RegisterScreenProps> = ({ onSwitchToLogin }) => {
    const { setAuthenticated } = useAuth();
    const { colors, isDark } = useTheme();
    const styles = React.useMemo(() => getStyles(colors), [colors]);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRegister = async () => {
        if (!username.trim() || !password || !email.trim()) {
            Alert.alert('Error', 'Please fill in all fields.');
            return;
        }

        try {
            setLoading(true);

            // 1. Register User
            await register(
                username.trim(),
                email.trim(),
                password
            );

            // 2. Automatically log in after registration
            await login(
                username.trim(),
                password,
            );

            setAuthenticated(true);
            ToastAndroid.show('Account created successfully', ToastAndroid.SHORT);
        } catch (error: any) {
            console.error(
                'REGISTER ERROR:',
                error?.response?.data || error?.message,
            );
            
            let errorMsg = 'Failed to create account.';
            if (error?.response?.data) {
                if (error.response.data.username) {
                    errorMsg = `Username: ${error.response.data.username[0]}`;
                } else if (error.response.data.email) {
                    errorMsg = `Email: ${error.response.data.email[0]}`;
                } else if (error.response.data.detail) {
                    errorMsg = error.response.data.detail;
                }
            }

            Alert.alert('Registration Failed', errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            setLoading(true);

            // Configure Google Signin (Client ID should come from .env in reality)
            GoogleSignin.configure({
                webClientId: '640643261518-jsev2qn560gbdbeoruj3sirspb9fjcsu.apps.googleusercontent.com',
                offlineAccess: true,
            });

            await GoogleSignin.hasPlayServices();
            const userInfo = await GoogleSignin.signIn();
            const serverAuthCode = userInfo.serverAuthCode;

            if (!serverAuthCode) {
                throw new Error("No server auth code returned from Google.");
            }

            await googleLogin(serverAuthCode);

            setAuthenticated(true);
            ToastAndroid.show('Google account linked successfully', ToastAndroid.SHORT);
        } catch (error: any) {
            console.error('GOOGLE LOGIN ERROR:', error);
            Alert.alert('Google Registration Failed', error.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Create Account</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Username"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="#888"
                />

                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    placeholderTextColor="#888"
                />

                <TextInput
                    style={styles.input}
                    placeholder="Password (min 8 chars)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholderTextColor="#888"
                />

                <TouchableOpacity
                    style={styles.button}
                    onPress={handleRegister}
                    disabled={loading}>
                    {loading ? (
                        <ActivityIndicator color={colors.surface} />
                    ) : (
                        <Text style={styles.buttonText}>Register</Text>
                    )}
                </TouchableOpacity>

                <View style={styles.dividerContainer}>
                    <View style={styles.divider} />
                    <Text style={styles.dividerText}>OR</Text>
                    <View style={styles.divider} />
                </View>

                <TouchableOpacity
                    style={styles.googleButton}
                    onPress={handleGoogleLogin}
                    disabled={loading}>
                    <GoogleIcon size={24} />
                    <Text style={styles.googleButtonText}>Continue with Google</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={styles.switchButton}
                    onPress={onSwitchToLogin}>
                    <Text style={styles.switchButtonText}>Already have an account? Log in</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

export default RegisterScreen;

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.surface,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 40,
        color: colors.onSurface,
    },
    input: {
        height: 50,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        paddingHorizontal: 16,
        marginBottom: 16,
        color: colors.onSurface,
    },
    button: {
        height: 50,
        borderRadius: 8,
        backgroundColor: colors.onSurface,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    buttonText: {
        color: colors.surface,
        fontSize: 16,
        fontWeight: '600',
    },
    switchButton: {
        marginTop: 24,
        alignItems: 'center',
    },
    switchButtonText: {
        color: '#1a73e8',
        fontSize: 14,
        fontWeight: '500',
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    divider: {
        flex: 1,
        height: 1,
        backgroundColor: '#e0e0e0',
    },
    dividerText: {
        marginHorizontal: 12,
        color: '#888',
        fontSize: 14,
    },
    googleButton: {
        height: 55,
        backgroundColor: colors.surface,
        borderRadius: 28, // pill shape
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
        borderWidth: 1,
        borderColor: colors.border,
    },
    googleButtonText: {
        color: colors.onSurface,
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 12,
    }
});
