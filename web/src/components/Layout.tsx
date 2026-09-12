import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Image as ImageIcon, Heart, FolderHeart, Trash2, Search, User, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SettingsModal from './SettingsModal';

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div style={{ padding: '0 24px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--accent-bg)', padding: '8px', borderRadius: '50%' }}>
            <ImageIcon size={24} color="var(--accent-color)" />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: '500', color: 'var(--text-primary)' }}>Own Gallery</h2>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <NavLink
            to="/"
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
            end
          >
            <ImageIcon size={20} />
            Photos
          </NavLink>
          <NavLink
            to="/favorites"
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            <Heart size={20} />
            Favorites
          </NavLink>
          <NavLink
            to="/albums"
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            <FolderHeart size={20} />
            Albums
          </NavLink>
          <NavLink
            to="/trash"
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            <Trash2 size={20} />
            Trash
          </NavLink>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Navbar */}
        <header className="top-nav">
          <div style={{ flex: 1, maxWidth: '600px', display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', padding: '8px 16px', borderRadius: '8px', gap: '12px' }}>
            <Search size={20} color="var(--text-secondary)" />
            <input
              type="text"
              placeholder="Search your photos"
              style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '15px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: '16px', position: 'relative' }}>
            <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings">
              <Settings size={22} />
            </button>
            <div
              style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'var(--accent-color)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '500', fontSize: '14px', cursor: 'pointer'
              }}
              title={`Logout (${user?.email})`}
              onClick={() => {
                if (window.confirm("Do you want to log out?")) {
                  logout();
                  navigate('/login');
                }
              }}
            >
              {user?.first_name ? user.first_name[0].toUpperCase() : <User size={18} />}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="page-content">
          <Outlet />
        </div>
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
};

export default Layout;
