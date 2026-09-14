import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Image as ImageIcon } from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import { useAuth } from '../context/auth';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

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

        <div className="auth-footer">
          Don't have an account? <Link to="/register">Create one</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
