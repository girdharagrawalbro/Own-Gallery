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
} from 'react-native';

import { login, register } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';

interface RegisterScreenProps {
    onSwitchToLogin: () => void;
}

const RegisterScreen: React.FC<RegisterScreenProps> = ({ onSwitchToLogin }) => {
    const { setAuthenticated } = useAuth();
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRegister = async () => {
        if (!username.trim() || !password || !email.trim() || !inviteCode.trim()) {
            Alert.alert('Error', 'Please fill in all fields.');
            return;
        }

        try {
            setLoading(true);

            // 1. Register User
            await register(
                username.trim(),
                email.trim(),
                password,
                inviteCode.trim()
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
                if (error.response.data.invite_code) {
                    errorMsg = error.response.data.invite_code[0];
                } else if (error.response.data.username) {
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

                <TextInput
                    style={[styles.input, { borderColor: '#1a73e8' }]}
                    placeholder="Secret Invite Code"
                    value={inviteCode}
                    onChangeText={setInviteCode}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="#888"
                />

                <TouchableOpacity
                    style={styles.button}
                    onPress={handleRegister}
                    disabled={loading}>
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>Register</Text>
                    )}
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
        marginTop: 8,
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
    }
});
