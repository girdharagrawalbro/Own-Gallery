import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { Image as ImageIcon, Play, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import UploadZone from '../components/UploadZone';
import MediaViewer from '../components/MediaViewer';

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
  const { logout, user } = useAuth();

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    try {
      const response = await apiClient.get('/media/');
      // Handle Django REST Framework paginated response
      const items = response.data.results ? response.data.results : response.data;
      setMedia(Array.isArray(items) ? items : []);
    } catch (error) {
      console.error('Failed to fetch media', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiClient.post(`/media/${id}/trash/`);
      setMedia(media.filter(m => m.id !== id));
      setViewerIndex(null); // close viewer
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

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px'
      }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>Welcome back, {user?.first_name}</h1>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <button className="btn-icon" onClick={logout} title="Logout" style={{ background: 'rgba(239, 68, 68, 0.2)' }}>
            <LogOut size={20} color="var(--danger-color)" />
          </button>
        </div>
      </header>

      <UploadZone onUploadSuccess={fetchMedia} />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Loading your media...
        </div>
      ) : media.length === 0 ? (
        <div className="glass-panel animate-fade-in" style={{ textAlign: 'center', padding: '64px 20px' }}>
          <ImageIcon size={48} color="var(--text-secondary)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h2>No media yet</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Upload some photos or videos to get started.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '16px'
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
                cursor: 'pointer'
              }}
              onClick={() => setViewerIndex(index)}
            >
              <img
                src={item.thumbnail_url || item.content_url}
                alt={item.filename}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {item.media_type === 'video' && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'rgba(0,0,0,0.5)',
                  borderRadius: '50%',
                  padding: '12px'
                }}>
                  <Play fill="white" color="white" size={24} />
                </div>
              )}
            </div>
          ))}
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

export default MediaGrid;
