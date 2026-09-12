import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { user, token, login } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage('');
    try {
      const response = await apiClient.put('/auth/me/', {
        first_name: firstName,
        last_name: lastName
      });
      if (token) {
        login(token, response.data);
      }
      setProfileMessage('Profile updated successfully');
    } catch (err) {
      console.error(err);
      setProfileMessage('Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPassword(true);
    setPasswordMessage('');
    setPasswordError('');
    try {
      await apiClient.post('/auth/change-password/', {
        old_password: oldPassword,
        new_password: newPassword
      });
      setPasswordMessage('Password changed successfully');
      setOldPassword('');
      setNewPassword('');
    } catch (err: any) {
      console.error(err);
      setPasswordError(err.response?.data?.old_password?.[0] || 'Failed to change password');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%', maxWidth: '500px',
        background: 'var(--bg-color)',
        padding: 0, display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600' }}>Settings</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
          <button 
            style={{ flex: 1, padding: '16px', fontWeight: '500', color: activeTab === 'profile' ? 'var(--accent-color)' : 'var(--text-secondary)', borderBottom: activeTab === 'profile' ? '2px solid var(--accent-color)' : '2px solid transparent' }}
            onClick={() => setActiveTab('profile')}
          >
            Profile
          </button>
          <button 
            style={{ flex: 1, padding: '16px', fontWeight: '500', color: activeTab === 'password' ? 'var(--accent-color)' : 'var(--text-secondary)', borderBottom: activeTab === 'password' ? '2px solid var(--accent-color)' : '2px solid transparent' }}
            onClick={() => setActiveTab('password')}
          >
            Security
          </button>
        </div>
        
        <div style={{ padding: '24px' }}>
          {activeTab === 'profile' && (
            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>Email</label>
                <input className="input-field" type="email" value={user?.email || ''} disabled style={{ opacity: 0.7 }} />
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>First Name</label>
                  <input className="input-field" type="text" value={firstName} onChange={e => setFirstName(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>Last Name</label>
                  <input className="input-field" type="text" value={lastName} onChange={e => setLastName(e.target.value)} />
                </div>
              </div>
              
              {profileMessage && <div style={{ color: 'var(--accent-color)', fontSize: '14px' }}>{profileMessage}</div>}
              
              <button type="submit" className="btn-primary" disabled={isSavingProfile} style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
                {isSavingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          )}
          
          {activeTab === 'password' && (
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>Current Password</label>
                <input className="input-field" type="password" required value={oldPassword} onChange={e => setOldPassword(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>New Password</label>
                <input className="input-field" type="password" required minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              
              {passwordError && <div style={{ color: 'var(--danger-color)', fontSize: '14px' }}>{passwordError}</div>}
              {passwordMessage && <div style={{ color: 'var(--accent-color)', fontSize: '14px' }}>{passwordMessage}</div>}
              
              <button type="submit" className="btn-primary" disabled={isSavingPassword} style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
                {isSavingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
