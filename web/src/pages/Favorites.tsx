import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { Heart, HeartOff, Check } from 'lucide-react';
import MediaViewer from '../components/MediaViewer';

import GroupedMediaGrid from '../components/GroupedMediaGrid';
import type { MediaItem } from '../utils/dateUtils';

const Favorites = () => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  useEffect(() => {
    fetchFavorites('/media/?is_favorite=true');
  }, []);

  const fetchFavorites = async (url: string) => {
    try {
      setLoading(true);
      const response = await apiClient.get(url);
      
      const newItems = response.data.results ? response.data.results : (Array.isArray(response.data) ? response.data : []);
      
      if (url === '/media/?is_favorite=true') {
        setMedia(newItems);
      } else {
        setMedia(prev => [...prev, ...newItems]);
      }
      
      setNextUrl(response.data.next || null);
    } catch (error) {
      console.error('Failed to fetch favorites', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (nextUrl && !loading) {
      const urlObj = new URL(nextUrl);
      fetchFavorites(urlObj.pathname + urlObj.search);
    }
  };

  const handleToggleFavorite = async (id: number) => {
    try {
      await apiClient.post(`/media/${id}/favorite/`, { is_favorite: false });
      setMedia(media.filter(m => m.id !== id));
      setViewerIndex(null);
    } catch (err) {
      console.error('Failed to toggle favorite', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to move this item to trash?")) return;
    try {
      await apiClient.post(`/media/${id}/trash/`);
      setMedia(media.filter(m => m.id !== id));
      setViewerIndex(null);
    } catch (err) {
      console.error('Failed to delete', err);
    }
  };

  const handleToggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(selectedId => selectedId !== id) : [...prev, id]
    );
  };

  const handleBulkUnfavorite = async () => {
    if (selectedIds.length === 0) return;
    try {
      await apiClient.post('/media/bulk-favorite/', { media_ids: selectedIds, is_favorite: false });
      setMedia(media.filter(m => !selectedIds.includes(m.id)));
      setSelectedIds([]);
      setIsSelectionMode(false);
    } catch (err) {
      console.error('Failed to bulk unfavorite', err);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '500' }}>Favorites</h1>
        {media.length > 0 && (
          <button 
            className="btn-icon" 
            onClick={() => setIsSelectionMode(!isSelectionMode)} 
            style={{ background: isSelectionMode ? 'var(--accent-bg)' : 'transparent', color: isSelectionMode ? 'var(--accent-color)' : 'var(--text-secondary)' }}
          >
            <Check size={20} />
          </button>
        )}
      </header>

      <GroupedMediaGrid
        media={media}
        loading={loading}
        hasMore={!!nextUrl}
        onLoadMore={handleLoadMore}
        isSelectionMode={isSelectionMode}
        selectedIds={selectedIds}
        onToggleSelection={handleToggleSelection}
        onItemClick={setViewerIndex}
        emptyIcon={<Heart size={48} color="var(--text-secondary)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />}
        emptyTitle="No favorites yet"
        emptyDescription="Star your favorite photos to see them here."
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
            <button onClick={handleBulkUnfavorite} className="btn-icon" title="Remove from favorites">
              <HeartOff size={20} />
            </button>
          </div>
        </div>
      )}

      {viewerIndex !== null && (
        <MediaViewer
          media={media}
          currentIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={handleDelete}
          onToggleFavorite={handleToggleFavorite}
        />
      )}
    </div>
  );
};

export default Favorites;
