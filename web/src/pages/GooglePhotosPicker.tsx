import { useEffect, useState } from 'react';
import { ArrowLeft, Check, CloudDownload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '../api/client';
import { showToast } from '../utils/toast';

const GooglePhotosPicker = () => {
  const [items, setItems] = useState<any[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const fetchPhotos = async (token?: string) => {
    setLoading(true);
    try {
      const data = await api.fetchGooglePhotos(token);
      setItems(prev => token ? [...prev, ...(data.mediaItems || [])] : (data.mediaItems || []));
      setNextPageToken(data.nextPageToken || null);
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
      
      {error && <div className="form-error" style={{ margin: 20 }}>{error}</div>}

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
