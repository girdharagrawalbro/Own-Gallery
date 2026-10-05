import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    ToastAndroid,
    Image,
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { login, googleLogin } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';


interface LoginScreenProps {
    onSwitchToRegister: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onSwitchToRegister }) => {
    const { setAuthenticated } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!username.trim() || !password) {
            Alert.alert('Error', 'Please enter username and password.');
            return;
        }

        try {
            setLoading(true);

            await login(
                username.trim(),
                password,
            );

            setAuthenticated(true);
            ToastAndroid.show('Login successful', ToastAndroid.SHORT);
        } catch (error: any) {
            console.error(
                'LOGIN ERROR:',
                error?.response?.data || error?.message,
            );

            Alert.alert(
                'Login Failed',
                error?.response?.data?.detail ||
                'Invalid username or password.',
            );
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
            ToastAndroid.show('Google Login successful', ToastAndroid.SHORT);
        } catch (error: any) {
            console.error('GOOGLE LOGIN ERROR:', error);
            Alert.alert('Google Login Failed', error.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    return (

        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Login to your Gallery</Text>

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
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholderTextColor="#888"
                />

                <TouchableOpacity
                    style={styles.button}
                    onPress={handleLogin}
                    disabled={loading}>
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>Login</Text>
                    )}
                </TouchableOpacity>

                <View style={styles.dividerContainer}>
                    <View style={styles.divider} />
                    <Text style={styles.dividerText}>OR</Text>
                    <View style={styles.divider} />
                </View>

                <TouchableOpacity
                    style={[styles.button, styles.googleButton]}
                    onPress={handleGoogleLogin}
                    disabled={loading}>
                    <Text style={styles.googleButtonText}>Sign in with Google</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.switchButton}
                    onPress={onSwitchToRegister}>
                    <Text style={styles.switchButtonText}>Don't have an account? Register</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

export default LoginScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },

    content: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },

    logoContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },

    logo: {
        width: 80,
        height: 80,
        borderRadius: 20,
    },

    title: {
        fontSize: 22,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 40,
    },

    input: {
        height: 50,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        paddingHorizontal: 16,
        marginBottom: 16,
    },

    button: {
        height: 50,
        borderRadius: 8,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },

    buttonText: {
        color: '#fff',
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
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ccc',
    },
    googleButtonText: {
        color: '#444',
        fontSize: 16,
        fontWeight: '600',
    }
});