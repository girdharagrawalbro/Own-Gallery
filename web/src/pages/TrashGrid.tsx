import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { Trash2, Check, RefreshCw } from 'lucide-react';
import AuthenticatedImage from '../components/AuthenticatedImage';

interface MediaItem {
  id: number;
  filename: string;
  thumbnail_url: string;
  content_url: string;
  media_type: string;
}

const TrashGrid = () => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  useEffect(() => {
    fetchTrash();
  }, []);

  const fetchTrash = async () => {
    try {
      const response = await apiClient.get('/media/trash/');
      const items = response.data.results ? response.data.results : response.data;
      setMedia(Array.isArray(items) ? items : []);
    } catch (error) {
      console.error('Failed to fetch trash', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(selectedId => selectedId !== id) : [...prev, id]
    );
  };

  const handleRestore = async () => {
    if (selectedIds.length === 0) return;
    try {
      for (const id of selectedIds) {
        await apiClient.post(`/media/${id}/restore/`);
      }
      setMedia(media.filter(m => !selectedIds.includes(m.id)));
      setSelectedIds([]);
      setIsSelectionMode(false);
    } catch (err) {
      console.error('Failed to restore', err);
    }
  };

  const handleDeletePermanent = async () => {
    if (selectedIds.length === 0) return;
    if (window.confirm('Are you sure you want to permanently delete the selected items? This cannot be undone.')) {
      try {
        for (const id of selectedIds) {
          await apiClient.delete(`/media/${id}/permanent-delete/`);
        }
        setMedia(media.filter(m => !selectedIds.includes(m.id)));
        setSelectedIds([]);
        setIsSelectionMode(false);
      } catch (err) {
        console.error('Failed to delete permanently', err);
      }
    }
  };

  const handleEmptyTrash = async () => {
    if (window.confirm('Are you sure you want to empty the trash? All items will be permanently deleted.')) {
      try {
        await apiClient.delete('/media/empty-trash/');
        setMedia([]);
        setSelectedIds([]);
        setIsSelectionMode(false);
      } catch (err) {
        console.error('Failed to empty trash', err);
      }
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '500' }}>Trash</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          {media.length > 0 && (
            <>
              <button 
                className="btn-icon" 
                onClick={() => setIsSelectionMode(!isSelectionMode)} 
                style={{ background: isSelectionMode ? 'var(--accent-bg)' : 'transparent', color: isSelectionMode ? 'var(--accent-color)' : 'var(--text-secondary)' }}
                title="Select Items"
              >
                <Check size={20} />
              </button>
              <button className="btn-icon" onClick={handleEmptyTrash} title="Empty Trash" style={{ color: 'var(--danger-color)' }}>
                <Trash2 size={20} />
              </button>
            </>
          )}
        </div>
      </header>
      
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
        Items in trash will be permanently deleted after 30 days.
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Loading trash...
        </div>
      ) : media.length === 0 ? (
        <div className="glass-panel animate-fade-in" style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--bg-secondary)', border: 'none' }}>
          <Trash2 size={48} color="var(--text-secondary)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h2 style={{ fontSize: '18px', fontWeight: '500' }}>Trash is empty</h2>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '8px'
        }}>
          {media.map((item, index) => (
            <div
              key={item.id}
              className="glass-panel animate-fade-in"
              style={{
                aspectRatio: '1/1',
                overflow: 'hidden',
                position: 'relative',
                animationDelay: `${index * 0.02}s`,
                cursor: 'pointer',
                borderRadius: '8px',
                border: 'none',
              }}
              onClick={() => {
                if (isSelectionMode) {
                  handleToggleSelection(item.id);
                } else {
                  handleToggleSelection(item.id);
                  if (!isSelectionMode) setIsSelectionMode(true);
                }
              }}
            >
              <AuthenticatedImage
                src={item.thumbnail_url || item.content_url}
                alt={item.filename}
                style={{ 
                  width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7,
                  transform: selectedIds.includes(item.id) ? 'scale(0.85)' : 'scale(1)',
                  transition: 'transform 0.2s',
                  borderRadius: selectedIds.includes(item.id) ? '8px' : '0'
                }}
              />
              
              {(isSelectionMode || selectedIds.includes(item.id)) && (
                <div style={{
                  position: 'absolute', top: '8px', left: '8px', width: '20px', height: '20px',
                  borderRadius: '50%', border: '2px solid white',
                  background: selectedIds.includes(item.id) ? 'var(--accent-color)' : 'rgba(0,0,0,0.3)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10
                }}>
                  {selectedIds.includes(item.id) && <Check size={12} color="white" />}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isSelectionMode && selectedIds.length > 0 && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '100px',
          padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '24px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100
        }}>
          <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{selectedIds.length} selected</span>
          <div style={{ display: 'flex', gap: '16px' }}>
            <button onClick={handleRestore} className="btn-icon" title="Restore">
              <RefreshCw size={20} />
            </button>
            <button onClick={handleDeletePermanent} className="btn-icon" title="Delete Permanently" style={{ color: 'var(--danger-color)' }}>
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrashGrid;
