import React, { useState } from 'react';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';

const AuthScreen = () => {
    const [isLogin, setIsLogin] = useState(true);

    if (isLogin) {
        return <LoginScreen onSwitchToRegister={() => setIsLogin(false)} />;
    } else {
        return <RegisterScreen onSwitchToLogin={() => setIsLogin(true)} />;
    }
};

export default AuthScreen;
