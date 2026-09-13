import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { Trash2, Check, RefreshCw } from 'lucide-react';
import GroupedMediaGrid from '../components/GroupedMediaGrid';
import type { MediaItem } from '../utils/dateUtils';

const TrashGrid = () => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  useEffect(() => {
    fetchTrash('/media/trash/');
  }, []);

  const fetchTrash = async (url: string) => {
    try {
      setLoading(true);
      const response = await apiClient.get(url);
      
      const newItems = response.data.results ? response.data.results : (Array.isArray(response.data) ? response.data : []);
      
      if (url === '/media/trash/') {
        setMedia(newItems);
      } else {
        setMedia(prev => [...prev, ...newItems]);
      }
      
      setNextUrl(response.data.next || null);
    } catch (error) {
      console.error('Failed to fetch trash', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (nextUrl && !loading) {
      const urlObj = new URL(nextUrl);
      fetchTrash(urlObj.pathname + urlObj.search);
    }
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

  const handlePermanentDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm("Permanently delete selected items? This cannot be undone.")) return;
    try {
      for (const id of selectedIds) {
        await apiClient.delete(`/media/${id}/permanent-delete/`);
      }
      setMedia(media.filter(m => !selectedIds.includes(m.id)));
      setSelectedIds([]);
      setIsSelectionMode(false);
    } catch (err) {
      console.error('Failed to permanently delete', err);
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm("Permanently delete all items in trash? This cannot be undone.")) return;
    try {
      await apiClient.delete('/media/empty-trash/');
      setMedia([]);
      setSelectedIds([]);
      setIsSelectionMode(false);
    } catch (err) {
      console.error('Failed to empty trash', err);
    }
  };

  const handleToggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(selectedId => selectedId !== id) : [...prev, id]
    );
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
              <button 
                onClick={handleEmptyTrash}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  color: 'var(--danger-color)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '100px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Empty Trash
              </button>
            </>
          )}
        </div>
      </header>

      <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center' }}>
        Items in trash will be permanently deleted after 60 days.
      </div>

      <GroupedMediaGrid
        media={media}
        loading={loading}
        hasMore={!!nextUrl}
        onLoadMore={handleLoadMore}
        isSelectionMode={isSelectionMode}
        selectedIds={selectedIds}
        onItemClick={(index) => {
          handleToggleSelection(media[index].id);
          if (!isSelectionMode) setIsSelectionMode(true);
        }}
        onToggleSelection={handleToggleSelection}
        emptyIcon={<Trash2 size={48} color="var(--text-secondary)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />}
        emptyTitle="Trash is empty"
        emptyDescription="Items you delete will appear here."
      />

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
            <button onClick={handlePermanentDelete} className="btn-icon" title="Delete Permanently" style={{ color: 'var(--danger-color)' }}>
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrashGrid;
