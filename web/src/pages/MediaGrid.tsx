import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { Heart, Trash2, Check, FolderPlus } from 'lucide-react';
import UploadZone from '../components/UploadZone';
import MediaViewer from '../components/MediaViewer';
import SelectAlbumModal from '../components/SelectAlbumModal';

import GroupedMediaGrid from '../components/GroupedMediaGrid';
import type { MediaItem } from '../utils/dateUtils';

const MediaGrid = () => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showSelectAlbum, setShowSelectAlbum] = useState(false);

  useEffect(() => {
    fetchMedia('/media/');
  }, []);

  const fetchMedia = async (url: string) => {
    try {
      setLoading(true);
      const response = await apiClient.get(url);
      
      const newItems = response.data.results ? response.data.results : (Array.isArray(response.data) ? response.data : []);
      
      if (url === '/media/') {
        setMedia(newItems);
      } else {
        setMedia(prev => [...prev, ...newItems]);
      }
      
      setNextUrl(response.data.next || null);
    } catch (error) {
      console.error('Failed to fetch media', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (nextUrl && !loading) {
      // apiClient.get automatically prepends base URL if we don't handle it, 
      // but DRF returns full URL for next. Let's just pass the path.
      const urlObj = new URL(nextUrl);
      fetchMedia(urlObj.pathname + urlObj.search);
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

  const handleToggleFavorite = async (id: number) => {
    try {
      const current = media.find(m => m.id === id);
      if (!current) return;
      await apiClient.post(`/media/${id}/favorite/`, { is_favorite: !current.is_favorite });
      setMedia(media.map(m => m.id === id ? { ...m, is_favorite: !current.is_favorite } : m));
    } catch (err) {
      console.error('Failed to toggle favorite', err);
    }
  };

  const handleToggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(selectedId => selectedId !== id) : [...prev, id]
    );
  };

  const handleBulkTrash = async () => {
    if (selectedIds.length === 0) return;
    try {
      await apiClient.post('/media/bulk-trash/', { media_ids: selectedIds });
      setMedia(media.filter(m => !selectedIds.includes(m.id)));
      setSelectedIds([]);
      setIsSelectionMode(false);
    } catch (err) {
      console.error('Failed to bulk trash', err);
    }
  };

  const handleBulkFavorite = async () => {
    if (selectedIds.length === 0) return;
    try {
      await apiClient.post('/media/bulk-favorite/', { media_ids: selectedIds, is_favorite: true });
      setMedia(media.map(m => selectedIds.includes(m.id) ? { ...m, is_favorite: true } : m));
      setSelectedIds([]);
      setIsSelectionMode(false);
    } catch (err) {
      console.error('Failed to bulk favorite', err);
    }
  };

  const handleAddToAlbum = async (albumId: number) => {
    if (selectedIds.length === 0) return;
    try {
      await apiClient.post(`/albums/${albumId}/add-media/`, { media_ids: selectedIds });
      setShowSelectAlbum(false);
      setSelectedIds([]);
      setIsSelectionMode(false);
      alert('Added to album successfully');
    } catch (error) {
      console.error('Failed to add to album', error);
      alert('Failed to add to album');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        {media.length > 0 && (
          <button 
            className="btn-icon" 
            onClick={() => setIsSelectionMode(!isSelectionMode)} 
            style={{ background: isSelectionMode ? 'var(--accent-bg)' : 'transparent', color: isSelectionMode ? 'var(--accent-color)' : 'var(--text-secondary)' }}
            title="Select Items"
          >
            <Check size={20} />
          </button>
        )}
      </div>

      <UploadZone onUploadSuccess={() => fetchMedia('/media/')} />

      <GroupedMediaGrid
        media={media}
        loading={loading}
        hasMore={!!nextUrl}
        onLoadMore={handleLoadMore}
        isSelectionMode={isSelectionMode}
        selectedIds={selectedIds}
        onToggleSelection={handleToggleSelection}
        onItemClick={setViewerIndex}
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
            <button onClick={handleBulkFavorite} className="btn-icon" title="Favorite">
              <Heart size={20} />
            </button>
            <button onClick={() => setShowSelectAlbum(true)} className="btn-icon" title="Add to Album">
              <FolderPlus size={20} />
            </button>
            <button onClick={handleBulkTrash} className="btn-icon" title="Trash" style={{ color: 'var(--danger-color)' }}>
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      )}

      {showSelectAlbum && (
        <SelectAlbumModal 
          onClose={() => setShowSelectAlbum(false)} 
          onSelect={handleAddToAlbum} 
        />
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

export default MediaGrid;
