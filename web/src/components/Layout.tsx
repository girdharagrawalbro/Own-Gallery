import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CloudUpload, FolderHeart, Heart, Image as ImageIcon, Search, Settings, Trash2, Upload, User, X } from 'lucide-react';
import { useAuth } from '../context/auth';
import { useUploadActions } from '../context/uploads';
import SettingsModal from './SettingsModal';
import ToastHost from './ToastHost';
import UploadPanel from './UploadPanel';

const NAV_ITEMS = [
  { to: '/', label: 'Photos', icon: ImageIcon, end: true },
  { to: '/favorites', label: 'Favorites', icon: Heart, end: false },
  { to: '/albums', label: 'Albums', icon: FolderHeart, end: false },
  { to: '/trash', label: 'Trash', icon: Trash2, end: false },
];

const SEARCH_DEBOUNCE_MS = 300;

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/* ------------------------------------------------------------------ */

const SearchBox = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const onSearchPage = location.pathname === '/search';
  const urlQuery = onSearchPage ? (params.get('q') ?? '') : '';

  const [query, setQuery] = useState(urlQuery);
  // Follow the URL (back/forward, leaving the search page) without an effect.
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery);
    setQuery(urlQuery);
  }

  const timerRef = useRef<number | undefined>(undefined);
  const latest = useRef({ onSearchPage, urlQuery });
  useEffect(() => {
    latest.current = { onSearchPage, urlQuery };
  });
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const go = (value: string, push: boolean) => {
    const { onSearchPage: onPage, urlQuery: current } = latest.current;
    if (!value.trim()) {
      if (onPage) navigate('/search', { replace: true });
      return;
    }
    if (onPage && value === current) return;
    navigate(`/search?q=${encodeURIComponent(value)}`, { replace: onPage && !push });
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => go(value, false), SEARCH_DEBOUNCE_MS);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      window.clearTimeout(timerRef.current);
      go(query, true);
    } else if (e.key === 'Escape') {
      e.currentTarget.blur();
    }
  };

  const clear = () => {
    window.clearTimeout(timerRef.current);
    setQuery('');
    if (onSearchPage) navigate('/search', { replace: true });
  };

  return (
    <div className="search-box" role="search">
      <Search size={20} className="search-icon" />
      <input
        type="search"
        placeholder="Search your photos"
        value={query}
        onChange={onChange}
        onKeyDown={onKeyDown}
        aria-label="Search your photos"
        enterKeyHint="search"
      />
      {query && (
        <button className="search-clear" onClick={clear} aria-label="Clear search">
          <X size={18} />
        </button>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const Layout = () => {
  const { user, logout } = useAuth();
  const { addFiles, openFilePicker } = useUploadActions();
  const [showSettings, setShowSettings] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Drag-and-drop anywhere in the app opens a full-page drop target.
  useEffect(() => {
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) addFiles(Array.from(files));
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [addFiles]);

  const initial = user?.first_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ImageIcon size={22} />
          </div>
          <span>Own Gallery</span>
        </div>
        <nav className="sidebar-nav" aria-label="Main">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="top-nav">
          <div className="brand brand-compact" aria-hidden="true">
            <div className="brand-mark">
              <ImageIcon size={20} />
            </div>
          </div>
          <SearchBox />
          <div className="top-actions">
            <button className="btn-upload" onClick={openFilePicker} title="Upload photos and videos">
              <Upload size={18} />
              <span>Upload</span>
            </button>
            <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings">
              <Settings size={22} />
            </button>
            <button
              className="avatar"
              title={`Sign out (${user?.email ?? ''})`}
              aria-label="Sign out"
              onClick={() => {
                if (window.confirm('Do you want to sign out?')) logout();
              }}
            >
              {initial ?? <User size={18} />}
            </button>
          </div>
        </header>

        <div className="page-content" data-scroll-root>
          <Outlet />
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Main">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
            <Icon size={22} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-inner">
            <CloudUpload size={56} />
            <div className="drop-overlay-title">Drop to upload</div>
            <div className="drop-overlay-sub">Photos and videos will be added to your library</div>
          </div>
        </div>
      )}

      <UploadPanel />
      <ToastHost />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
};

export default Layout;
