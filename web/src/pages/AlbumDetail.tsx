import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { ArrowLeft, Image as ImageIcon, Play, Check, Trash2, FolderMinus } from 'lucide-react';
import MediaViewer from '../components/MediaViewer';
import AuthenticatedImage from '../components/AuthenticatedImage';

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

interface Album {
  id: number;
  name: string;
}

const AlbumDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<Album | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  useEffect(() => {
    fetchAlbumMedia();
  }, [id]);

  const fetchAlbumMedia = async () => {
    try {
      const response = await apiClient.get(`/albums/${id}/media/`);
      setAlbum(response.data.album);
      setMedia(response.data.media);
    } catch (error) {
      console.error('Failed to fetch album media', error);
      navigate('/albums');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelection = (mediaId: number) => {
    setSelectedIds(prev => 
      prev.includes(mediaId) ? prev.filter(selectedId => selectedId !== mediaId) : [...prev, mediaId]
    );
  };

  const handleRemoveFromAlbum = async () => {
    if (selectedIds.length === 0) return;
    try {
      await apiClient.post(`/albums/${id}/remove-media/`, { media_ids: selectedIds });
      setMedia(media.filter(m => !selectedIds.includes(m.id)));
      setSelectedIds([]);
      setIsSelectionMode(false);
    } catch (err) {
      console.error('Failed to remove from album', err);
    }
  };

  const handleDeleteAlbum = async () => {
    if (window.confirm("Are you sure you want to delete this album? The photos inside will not be deleted.")) {
      try {
        await apiClient.delete(`/albums/${id}/`);
        navigate('/albums');
      } catch (err) {
        console.error('Failed to delete album', err);
      }
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn-icon" onClick={() => navigate('/albums')} title="Back to Albums">
            <ArrowLeft size={24} />
          </button>
          <h1 style={{ fontSize: '24px', fontWeight: '500' }}>{album?.name || 'Loading...'}</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {media.length > 0 && (
            <button 
              className="btn-icon" 
              onClick={() => setIsSelectionMode(!isSelectionMode)} 
              style={{ background: isSelectionMode ? 'var(--accent-bg)' : 'transparent', color: isSelectionMode ? 'var(--accent-color)' : 'var(--text-secondary)' }}
            >
              <Check size={20} />
            </button>
          )}
          <button className="btn-icon" onClick={handleDeleteAlbum} title="Delete Album" style={{ color: 'var(--danger-color)' }}>
            <Trash2 size={20} />
          </button>
        </div>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading album...</div>
      ) : media.length === 0 ? (
        <div className="glass-panel animate-fade-in" style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--bg-secondary)', border: 'none' }}>
          <ImageIcon size={48} color="var(--text-secondary)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h2 style={{ fontSize: '18px', fontWeight: '500' }}>Album is empty</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Add photos to this album from your main gallery.</p>
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
                aspectRatio: '1/1', overflow: 'hidden', position: 'relative',
                animationDelay: `${index * 0.02}s`, cursor: 'pointer', borderRadius: '8px', border: 'none'
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
            <button onClick={handleRemoveFromAlbum} className="btn-icon" title="Remove from Album">
              <FolderMinus size={20} />
            </button>
          </div>
        </div>
      )}

      {viewerIndex !== null && (
        <MediaViewer
          media={media}
          currentIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={() => {}} // Deleting from album detail might require more logic or just removing from album
          onToggleFavorite={() => {}} // We skip favorite toggling here for simplicity, or we can pass the real function
        />
      )}
    </div>
  );
};

export default AlbumDetail;
