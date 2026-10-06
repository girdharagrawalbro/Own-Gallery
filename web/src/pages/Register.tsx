import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { UserPlus, Download } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { api, getErrorMessage } from '../api/client';
import { useAuth } from '../context/auth';

function registrationError(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as Record<string, unknown> | undefined;
    const first = (key: string) => {
      const value = data?.[key];
      return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null;
    };
    const invite = first('invite_code');
    if (invite) return invite;
    const username = first('username');
    if (username) return `Username: ${username}`;
    const email = first('email');
    if (email) return `Email: ${email}`;
    const password = first('password');
    if (password) return `Password: ${password}`;
  }
  return getErrorMessage(err, 'Registration failed. Please check your inputs.');
}

const Register = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
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
        setError(getErrorMessage(err, 'Google Registration failed.'));
      } finally {
        setIsLoading(false);
      }
    },
    onError: () => {
      setError('Google Registration failed.');
    },
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await api.register({ username, email, password });
      // Sign in straight away and keep both tokens.
      const tokens = await api.login(username, password);
      if (!tokens.access || !tokens.refresh) throw new Error('Login response did not include tokens');
      const me = await api.me(tokens.access);
      login(tokens, me);
      navigate('/', { replace: true });
    } catch (err) {
      setError(registrationError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-in">
        <div className="auth-logo">
          <UserPlus size={36} />
        </div>
        <h1>Create account</h1>
        <p className="auth-subtitle">Join the private gallery using your invite code.</p>

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
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoCapitalize="none"
            autoComplete="email"
          />
          <input
            className="input-field"
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#e0e0e0' }} />
          <span style={{ margin: '0 10px', color: '#777', fontSize: '13px' }}>OR</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#e0e0e0' }} />
        </div>

        <button 
          type="button"
          onClick={() => googleLogin()} 
          className="btn-primary" 
          style={{ backgroundColor: '#fff', color: '#444', border: '1px solid #ccc', marginBottom: '16px' }}
          disabled={isLoading}
        >
          <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google" style={{ width: '18px', marginRight: '8px', verticalAlign: 'middle' }} />
          Continue with Google
        </button>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>

        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <a href="https://github.com/girdharagrawalbro/Own-Gallery/releases/latest/download/app-release.apk" target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#e8f0fe', color: '#1a73e8', textDecoration: 'none', width: '100%' }}>
            <Download size={18} />
            Download Android App
          </a>
        </div>
      </div>
    </div>
  );
};

export default Register;
