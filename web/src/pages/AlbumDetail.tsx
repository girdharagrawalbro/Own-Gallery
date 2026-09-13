import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { Image as ImageIcon, Check, Trash2, FolderMinus } from 'lucide-react';
import MediaViewer from '../components/MediaViewer';

import GroupedMediaGrid from '../components/GroupedMediaGrid';
import type { MediaItem } from '../utils/dateUtils';

interface Album {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

const AlbumDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<Album | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  useEffect(() => {
    fetchAlbum();
    fetchMedia(`/media/?album=${id}`);
  }, [id]);

  const fetchAlbum = async () => {
    try {
      const response = await apiClient.get(`/albums/${id}/`);
      setAlbum(response.data);
    } catch (error) {
      console.error('Failed to fetch album details', error);
      navigate('/albums');
    }
  };

  const fetchMedia = async (url: string) => {
    try {
      setLoading(true);
      const response = await apiClient.get(url);
      
      const newItems = response.data.results ? response.data.results : (Array.isArray(response.data) ? response.data : []);
      
      if (url === `/media/?album=${id}`) {
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
      const urlObj = new URL(nextUrl);
      fetchMedia(urlObj.pathname + urlObj.search);
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

  const handleToggleFavorite = async (mediaId: number) => {
    try {
      const current = media.find(m => m.id === mediaId);
      if (!current) return;
      await apiClient.post(`/media/${mediaId}/favorite/`, { is_favorite: !current.is_favorite });
      setMedia(media.map(m => m.id === mediaId ? { ...m, is_favorite: !current.is_favorite } : m));
    } catch (err) {
      console.error('Failed to toggle favorite', err);
    }
  };

  const handleDelete = async (mediaId: number) => {
    if (!window.confirm("Are you sure you want to move this item to trash?")) return;
    try {
      await apiClient.post(`/media/${mediaId}/trash/`);
      setMedia(media.filter(m => m.id !== mediaId));
      setViewerIndex(null);
    } catch (err) {
      console.error('Failed to delete', err);
    }
  };

  if (!album) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Loading album...</div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <button 
            onClick={() => navigate('/albums')}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '8px', padding: 0 }}
          >
            ← Back to Albums
          </button>
          <h1 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '8px' }}>{album.name}</h1>
          {album.description && (
            <p style={{ color: 'var(--text-secondary)' }}>{album.description}</p>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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

      <GroupedMediaGrid
        media={media}
        loading={loading}
        hasMore={!!nextUrl}
        onLoadMore={handleLoadMore}
        isSelectionMode={isSelectionMode}
        selectedIds={selectedIds}
        onToggleSelection={handleToggleSelection}
        onItemClick={setViewerIndex}
        emptyIcon={<ImageIcon size={48} color="var(--text-secondary)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />}
        emptyTitle="Album is empty"
        emptyDescription="Add photos to this album from your main gallery."
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
            <button onClick={handleRemoveFromAlbum} className="btn-icon" title="Remove from Album">
              <FolderMinus size={20} />
            </button>
            <button onClick={() => {
              for (const id of selectedIds) {
                handleDelete(id);
              }
              setSelectedIds([]);
              setIsSelectionMode(false);
            }} className="btn-icon" title="Trash" style={{ color: 'var(--danger-color)' }}>
              <Trash2 size={20} />
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

export default AlbumDetail;
