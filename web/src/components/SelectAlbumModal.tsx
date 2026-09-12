import React, { useEffect, useState } from 'react';
import { X, Image as ImageIcon } from 'lucide-react';
import { apiClient } from '../api/client';

interface Album {
  id: number;
  name: string;
}

interface SelectAlbumModalProps {
  onClose: () => void;
  onSelect: (albumId: number) => void;
}

const SelectAlbumModal: React.FC<SelectAlbumModalProps> = ({ onClose, onSelect }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', background: 'var(--bg-color)', padding: 0 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '500' }}>Add to Album</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>
        
        <div style={{ maxHeight: '300px', overflowY: 'auto', padding: '12px' }}>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
          ) : albums.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>No albums available. Create one in the Albums tab.</div>
          ) : (
            albums.map(album => (
              <button
                key={album.id}
                onClick={() => onSelect(album.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
                  borderRadius: '8px', transition: 'background 0.2s', textAlign: 'left', color: 'var(--text-primary)'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <ImageIcon size={20} color="var(--text-secondary)" />
                {album.name}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SelectAlbumModal;
