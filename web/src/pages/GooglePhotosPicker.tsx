import { useEffect, useState } from 'react';
import { ArrowLeft, Check, CloudDownload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { api, getErrorMessage } from '../api/client';
import { showToast } from '../utils/toast';

const GooglePhotosPicker = () => {
  const [items, setItems] = useState<any[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const connectGoogle = useGoogleLogin({
    flow: 'auth-code',
    scope: 'https://www.googleapis.com/auth/photoslibrary.readonly',
    onSuccess: async (codeResponse) => {
      try {
        setLoading(true);
        setError('');
        await api.googleLogin(codeResponse.code);
        showToast('Google Photos connected successfully!');
        fetchPhotos();
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to connect Google account'));
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setError('Google authorization was cancelled or failed.');
    },
  });

  const fetchPhotos = async (token?: string) => {
    setLoading(true);
    try {
      const data = await api.fetchGooglePhotos(token);
      setItems(prev => token ? [...prev, ...(data.mediaItems || [])] : (data.mediaItems || []));
      setNextPageToken(data.nextPageToken || null);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch Google Photos'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPhotos();
  }, []);

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;
    setImporting(true);
    try {
      const selectedItems = items.filter(i => selectedIds.has(i.id));
      await api.importGooglePhotos(selectedItems);
      showToast(`Importing ${selectedIds.size} items in the background`);
      setSelectedIds(new Set());
    } catch (err) {
      showToast(getErrorMessage(err, 'Import failed'), 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="album-detail-page" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="album-hero-top-bar" style={{ position: 'relative', background: 'var(--bg-primary)', padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
        <Link to="/settings" className="btn-icon" aria-label="Back">
          <ArrowLeft size={22} />
        </Link>
        <h1 style={{ fontSize: '18px', fontWeight: 600, marginLeft: 16 }}>Select from Google Photos</h1>
        <div style={{ flex: 1 }} />
        <button onClick={selectAll} className="pill-btn" style={{ marginRight: 16 }}>
          {selectedIds.size === items.length && items.length > 0 ? 'Deselect all' : 'Select all'}
        </button>
        <button onClick={handleImport} className="btn-primary" disabled={importing || selectedIds.size === 0}>
          <CloudDownload size={18} style={{ marginRight: 8 }} />
          {importing ? 'Importing...' : `Import ${selectedIds.size > 0 ? selectedIds.size : ''}`}
        </button>
      </header>
      
      {error && (
        <div style={{ margin: 20, padding: '16px 20px', background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 12, border: '1px solid var(--border-color, #e0e0e0)', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ color: '#d93025', fontSize: 14, fontWeight: 500 }}>
            {error.includes('SCOPE_INSUFFICIENT') || error.includes('insufficient')
              ? 'Google Photos access permissions have not been granted to this app.'
              : error}
          </div>
          <button className="btn-primary" onClick={() => connectGoogle()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google" style={{ width: 16, height: 16 }} />
            Authorize Google Photos Access
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div className="media-grid">
          {items.map(item => {
            const selected = selectedIds.has(item.id);
            return (
              <div 
                key={item.id} 
                className={`media-item-container ${selected ? 'selected' : ''}`}
                onClick={() => toggleSelect(item.id)}
                style={{ cursor: 'pointer', position: 'relative', borderRadius: 8, overflow: 'hidden' }}
              >
                <img 
                  src={`${item.baseUrl}=w400-h400-c`} 
                  alt="" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                />
                <div className="media-item-overlay" />
                <button className="select-badge">
                  {selected && <Check size={14} strokeWidth={3} />}
                </button>
              </div>
            );
          })}
        </div>
        {loading && <div style={{ textAlign: 'center', padding: 20 }}>Loading...</div>}
        {nextPageToken && !loading && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <button className="pill-btn" onClick={() => fetchPhotos(nextPageToken)}>Load more</button>
          </div>
        )}
        {!loading && items.length === 0 && !error && (
          <div className="empty-state">
            <CloudDownload size={48} />
            <h2>No Google Photos found</h2>
            <p>Your connected account doesn't have any media or we couldn't load them.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GooglePhotosPicker;
