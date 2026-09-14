import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { UserPlus } from 'lucide-react';
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
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await api.register({ username, email, password, invite_code: inviteCode });
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
          <input
            className="input-field"
            type="text"
            placeholder="Invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
            autoCapitalize="none"
          />
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
