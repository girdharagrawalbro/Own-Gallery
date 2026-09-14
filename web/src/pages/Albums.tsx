import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, Plus, X } from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import MediaImage from '../components/MediaImage';
import Modal from '../components/Modal';
import type { Album } from '../types/media';

const Albums = () => {
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listAlbums()
      .then((list) => {
        if (!cancelled) setAlbums(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(err, 'Failed to load albums'));
          setAlbums([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const closeCreate = () => {
    setShowCreate(false);
    setNewAlbumName('');
    setCreateError(null);
  };

  const handleCreateAlbum = async (e: FormEvent) => {
    e.preventDefault();
    const name = newAlbumName.trim();
    if (!name) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const album = await api.createAlbum(name);
      setAlbums((prev) => [album, ...(prev ?? [])]);
      closeCreate();
    } catch (err) {
      setCreateError(getErrorMessage(err, 'Failed to create album'));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="library">
      <header className="page-header">
        <h1>Albums</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={18} /> Create album
        </button>
      </header>

      {showCreate && (
        <Modal onClose={closeCreate} labelledBy="new-album-title">
          <div className="modal-header">
            <h2 id="new-album-title">New album</h2>
            <button className="btn-icon" onClick={closeCreate} aria-label="Close">
              <X size={20} />
            </button>
          </div>
          <form className="modal-body" onSubmit={handleCreateAlbum}>
            <input
              className="input-field"
              type="text"
              placeholder="Album title"
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              autoFocus
              required
            />
            {createError && <div className="form-error">{createError}</div>}
            <div className="modal-footer">
              <button type="button" className="text-btn" onClick={closeCreate}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isCreating || !newAlbumName.trim()}>
                {isCreating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {loadError && <div className="inline-error">{loadError}</div>}

      {albums === null ? (
        <div className="album-grid" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i}>
              <div className="album-cover shimmer" />
              <div className="album-title-skeleton shimmer" />
            </div>
          ))}
        </div>
      ) : albums.length === 0 ? (
        <div className="empty-state">
          <ImageIcon size={48} />
          <h2>No albums yet</h2>
          <p>Organize your photos into albums.</p>
        </div>
      ) : (
        <div className="album-grid">
          {albums.map((album) => (
            <Link key={album.id} to={`/albums/${album.id}`} className="album-card">
              <div className="album-cover">
                {album.cover_url ? (
                  <MediaImage src={album.cover_url} alt={album.name} />
                ) : (
                  <ImageIcon size={40} className="album-cover-empty" />
                )}
              </div>
              <h3>{album.name}</h3>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Albums;
