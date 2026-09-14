import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Image as ImageIcon, Plus, X } from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import type { Album } from '../types/media';
import MediaImage from './MediaImage';
import Modal from './Modal';

interface SelectAlbumModalProps {
  onClose: () => void;
  onSelect: (album: Album) => void;
}

const SelectAlbumModal = ({ onClose, onSelect }: SelectAlbumModalProps) => {
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listAlbums()
      .then((list) => {
        if (!cancelled) setAlbums(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(getErrorMessage(err, 'Failed to load albums'));
          setAlbums([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const album = await api.createAlbum(name);
      onSelect(album);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create album'));
      setCreating(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="select-album-title">
      <div className="modal-header">
        <h2 id="select-album-title">Add to album</h2>
        <button className="btn-icon" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>

      <form className="new-album-row" onSubmit={handleCreate}>
        <input
          className="input-field"
          placeholder="New album title"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn-primary sm" disabled={creating || !newName.trim()}>
          <Plus size={16} /> {creating ? 'Creating…' : 'Create'}
        </button>
      </form>

      {error && <div className="form-error">{error}</div>}

      <div className="album-pick-list">
        {albums === null ? (
          <div className="muted-center">Loading…</div>
        ) : albums.length === 0 ? (
          <div className="muted-center">No albums yet. Create one above.</div>
        ) : (
          albums.map((album) => (
            <button key={album.id} className="album-pick" onClick={() => onSelect(album)}>
              <div className="album-pick-cover">
                {album.cover_url ? <MediaImage src={album.cover_url} alt="" /> : <ImageIcon size={20} />}
              </div>
              <span>{album.name}</span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
};

export default SelectAlbumModal;
