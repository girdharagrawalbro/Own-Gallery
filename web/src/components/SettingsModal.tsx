import { useState } from 'react';
import type { FormEvent } from 'react';
import { AxiosError } from 'axios';
import { X } from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import { useAuth } from '../context/auth';
import Modal from './Modal';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal = ({ onClose }: SettingsModalProps) => {
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');

  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ text: string; error: boolean } | null>(null);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; error: boolean } | null>(null);

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage(null);
    try {
      updateUser(await api.updateMe({ first_name: firstName, last_name: lastName }));
      setProfileMessage({ text: 'Profile updated', error: false });
    } catch (err) {
      setProfileMessage({ text: getErrorMessage(err, 'Failed to update profile'), error: true });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setIsSavingPassword(true);
    setPasswordMessage(null);
    try {
      await api.changePassword(oldPassword, newPassword);
      setPasswordMessage({ text: 'Password changed', error: false });
      setOldPassword('');
      setNewPassword('');
    } catch (err) {
      const data = err instanceof AxiosError ? (err.response?.data as Record<string, unknown> | undefined) : undefined;
      const fieldError = Array.isArray(data?.old_password) ? String(data.old_password[0]) : null;
      setPasswordMessage({ text: fieldError ?? getErrorMessage(err, 'Failed to change password'), error: true });
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="settings-title" width={500}>
      <div className="modal-header">
        <h2 id="settings-title">Settings</h2>
        <button className="btn-icon" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={activeTab === 'profile'} className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>
          Profile
        </button>
        <button role="tab" aria-selected={activeTab === 'password'} className={activeTab === 'password' ? 'active' : ''} onClick={() => setActiveTab('password')}>
          Security
        </button>
      </div>

      <div className="modal-body">
        {activeTab === 'profile' && (
          <form onSubmit={handleUpdateProfile} className="settings-form">
            <label className="field">
              <span>Email</span>
              <input className="input-field" type="email" value={user?.email ?? ''} disabled />
            </label>
            <div className="field-row">
              <label className="field">
                <span>First name</span>
                <input className="input-field" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </label>
              <label className="field">
                <span>Last name</span>
                <input className="input-field" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </label>
            </div>
            {profileMessage && <div className={profileMessage.error ? 'form-error' : 'form-success'}>{profileMessage.text}</div>}
            <button type="submit" className="btn-primary align-start" disabled={isSavingProfile}>
              {isSavingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </form>
        )}

        {activeTab === 'password' && (
          <form onSubmit={handleChangePassword} className="settings-form">
            <label className="field">
              <span>Current password</span>
              <input className="input-field" type="password" required value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" />
            </label>
            <label className="field">
              <span>New password</span>
              <input className="input-field" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </label>
            {passwordMessage && <div className={passwordMessage.error ? 'form-error' : 'form-success'}>{passwordMessage.text}</div>}
            <button type="submit" className="btn-primary align-start" disabled={isSavingPassword}>
              {isSavingPassword ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
};

export default SettingsModal;
