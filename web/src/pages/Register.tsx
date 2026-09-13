import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { UserPlus } from 'lucide-react';

const Register = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // 1. Register User
      await apiClient.post('/auth/register/', {
        username,
        email,
        password,
        invite_code: inviteCode
      });

      // 2. Automatically log in after registration
      const response = await apiClient.post('/auth/login/', { username, password });
      const accessToken = response.data.access;

      if (!accessToken) {
        throw new Error('No access token received');
      }

      // 3. Fetch User Profile
      const meResponse = await apiClient.get('/auth/me/', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      // 4. Finalize Login
      login(accessToken, meResponse.data);
      navigate('/');
    } catch (err: any) {
      if (err.response?.data?.invite_code) {
        setError(err.response.data.invite_code[0]);
      } else if (err.response?.data?.username) {
        setError('Username: ' + err.response.data.username[0]);
      } else if (err.response?.data?.email) {
        setError('Email: ' + err.response.data.email[0]);
      } else {
        setError(err.response?.data?.error || 'Registration failed. Please check your inputs.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '400px',
        padding: '40px',
        textAlign: 'center'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div style={{
            background: 'rgba(59, 130, 246, 0.2)',
            padding: '16px',
            borderRadius: '50%'
          }}>
            <UserPlus size={48} color="#007AFF" />
          </div>
        </div>

        <h1 style={{ marginBottom: '8px', fontSize: '24px' }}>Create Account</h1>
        <p style={{ marginBottom: '24px', fontSize: '14px', color: '#888' }}>
          Join the private gallery using your invite code.
        </p>

        {error && (
          <div style={{
            backgroundColor: 'rgba(255, 59, 48, 0.1)',
            color: 'var(--danger-color)',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input
            className="input-field"
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoCapitalize="none"
          />
          <input
            className="input-field"
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoCapitalize="none"
          />
          <input
            className="input-field"
            type="password"
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <input
            className="input-field"
            type="text"
            placeholder="Secret Invite Code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
            autoCapitalize="none"
            style={{ borderColor: 'rgba(59, 130, 246, 0.5)' }}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={isLoading}
            style={{ marginTop: '8px', opacity: isLoading ? 0.7 : 1 }}
          >
            {isLoading ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <div style={{ marginTop: '24px', fontSize: '14px', color: '#888' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: '#007AFF', textDecoration: 'none', fontWeight: '500' }}>
            Log in
          </a>
        </div>
      </div>
    </div>
  );
};

export default Register;
