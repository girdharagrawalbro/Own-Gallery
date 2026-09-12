import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useNavigate } from 'react-router-dom';
import { Plus, Image as ImageIcon } from 'lucide-react';

interface Album {
  id: number;
  name: string;
  cover_image: string | null;
  created_at: string;
}

const Albums = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAlbums();
  }, []);

  const fetchAlbums = async () => {
    try {
      const response = await apiClient.get('/albums/');
      setAlbums(response.data.results || response.data);
    } catch (error) {
      console.error('Failed to fetch albums', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlbumName.trim()) return;
    setIsCreating(true);
    try {
      const response = await apiClient.post('/albums/', { name: newAlbumName });
      setAlbums([response.data, ...albums]);
      setShowCreate(false);
      setNewAlbumName('');
    } catch (error) {
      console.error('Failed to create album', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '500' }}>Albums</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} /> Create album
        </button>
      </header>

      {showCreate && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '16px' }}>New Album</h2>
            <form onSubmit={handleCreateAlbum}>
              <input
                className="input-field"
                type="text"
                placeholder="Album title"
                value={newAlbumName}
                onChange={e => setNewAlbumName(e.target.value)}
                autoFocus
                required
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', color: 'var(--text-secondary)' }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isCreating || !newAlbumName.trim()}>
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading albums...</div>
      ) : albums.length === 0 ? (
        <div className="glass-panel animate-fade-in" style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--bg-secondary)', border: 'none' }}>
          <ImageIcon size={48} color="var(--text-secondary)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h2 style={{ fontSize: '18px', fontWeight: '500' }}>No albums yet</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Organize your photos into albums.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '24px'
        }}>
          {albums.map((album, index) => (
            <div
              key={album.id}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 0.02}s`, cursor: 'pointer' }}
              onClick={() => navigate(`/albums/${album.id}`)}
            >
              <div style={{
                aspectRatio: '1/1', background: 'var(--bg-secondary)', borderRadius: '12px',
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '12px', border: '1px solid var(--border-color)', transition: 'box-shadow 0.2s'
              }} className="album-card">
                {album.cover_image ? (
                  <img src={album.cover_image} alt={album.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <ImageIcon size={40} color="var(--text-secondary)" style={{ opacity: 0.3 }} />
                )}
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: '500', color: 'var(--text-primary)' }}>{album.name}</h3>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Albums;
