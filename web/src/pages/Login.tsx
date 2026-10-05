import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Image as ImageIcon, Download } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { api, getErrorMessage } from '../api/client';
import { useAuth } from '../context/auth';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const googleLogin = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async (codeResponse) => {
      setIsLoading(true);
      setError('');
      try {
        const tokens = await api.googleLogin(codeResponse.code);
        if (!tokens.access || !tokens.refresh) throw new Error('Login response did not include tokens');
        const me = await api.me(tokens.access);
        login(tokens, me);
        navigate('/', { replace: true });
      } catch (err) {
        setError(getErrorMessage(err, 'Google Login failed.'));
      } finally {
        setIsLoading(false);
      }
    },
    onError: () => {
      setError('Google Login failed.');
    },
  });


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const tokens = await api.login(username, password);
      if (!tokens.access || !tokens.refresh) throw new Error('Login response did not include tokens');
      const me = await api.me(tokens.access);
      login(tokens, me);
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed. Please check your credentials.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-in">
        <div className="auth-logo">
          <ImageIcon size={36} />
        </div>
        <h1>Sign in to Own Gallery</h1>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            className="input-field"
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoCapitalize="none"
            autoComplete="username"
          />
          <input
            className="input-field"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#e0e0e0' }} />
          <span style={{ margin: '0 10px', color: '#777', fontSize: '13px' }}>OR</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#e0e0e0' }} />
        </div>

        <button 
          onClick={() => googleLogin()} 
          className="btn-primary" 
          style={{ backgroundColor: '#fff', color: '#444', border: '1px solid #ccc', marginBottom: '16px' }}
          disabled={isLoading}
        >
          <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google" style={{ width: '18px', marginRight: '8px', verticalAlign: 'middle' }} />
          Sign in with Google
        </button>

        <div className="auth-footer">
          Don't have an account? <Link to="/register">Create one</Link>
        </div>
        
        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <a href="/own-gallery.apk" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#e8f0fe', color: '#1a73e8', textDecoration: 'none', width: '100%' }}>
            <Download size={18} />
            Download Android App
          </a>
        </div>
      </div>
    </div>
  );
};

export default Login;

