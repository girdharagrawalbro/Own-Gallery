import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { Image as ImageIcon, Play, Heart, Trash2, Check, FolderPlus } from 'lucide-react';
import UploadZone from '../components/UploadZone';
import MediaViewer from '../components/MediaViewer';
import AuthenticatedImage from '../components/AuthenticatedImage';
import SelectAlbumModal from '../components/SelectAlbumModal';

interface MediaItem {
  id: number;
  filename: string;
  thumbnail_url: string;
  content_url: string;
  media_type: string;
  is_favorite: boolean;
  file_size: number;
  width: number;
  height: number;
  created_at: string;
}

const MediaGrid = () => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showSelectAlbum, setShowSelectAlbum] = useState(false);

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    try {
      const response = await apiClient.get('/media/');
      const items = response.data.results ? response.data.results : response.data;
      setMedia(Array.isArray(items) ? items : []);
    } catch (error) {
      console.error('Failed to fetch media', error);
    } finally {
      setLoading(false);
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

      <UploadZone onUploadSuccess={fetchMedia} />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Loading your media...
        </div>
      ) : media.length === 0 ? (
        <div className="glass-panel animate-fade-in" style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--bg-secondary)', border: 'none' }}>
          <ImageIcon size={48} color="var(--text-secondary)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h2 style={{ fontSize: '18px', fontWeight: '500' }}>No photos yet</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Upload some photos or videos to get started.</p>
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
                  setViewerIndex(index);
                }
              }}
            >
              <AuthenticatedImage
                src={item.thumbnail_url || item.content_url}
                alt={item.filename}
                style={{ 
                  width: '100%', height: '100%', objectFit: 'cover',
                  transform: selectedIds.includes(item.id) ? 'scale(0.85)' : 'scale(1)',
                  transition: 'transform 0.2s',
                  borderRadius: selectedIds.includes(item.id) ? '8px' : '0'
                }}
              />
              
              {isSelectionMode && (
                <div style={{
                  position: 'absolute', top: '8px', left: '8px', width: '20px', height: '20px',
                  borderRadius: '50%', border: '2px solid white',
                  background: selectedIds.includes(item.id) ? 'var(--accent-color)' : 'rgba(0,0,0,0.3)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10
                }}>
                  {selectedIds.includes(item.id) && <Check size={12} color="white" />}
                </div>
              )}
              {item.media_type === 'video' && (
                <div style={{ position: 'absolute', top: '8px', right: '8px', color: 'white', background: 'rgba(0,0,0,0.3)', borderRadius: '50%', padding: '4px' }}>
                  <Play fill="white" size={12} />
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
