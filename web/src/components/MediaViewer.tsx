import React from 'react';
import { X, Info, Download, Trash2, Heart } from 'lucide-react';
import { apiClient } from '../api/client';

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

interface MediaViewerProps {
  media: MediaItem[];
  currentIndex: number;
  onClose: () => void;
  onDelete: (id: number) => void;
  onToggleFavorite: (id: number) => void;
}

const MediaViewer: React.FC<MediaViewerProps> = ({ media, currentIndex, onClose, onDelete, onToggleFavorite }) => {
  const [showInfo, setShowInfo] = React.useState(false);
  const currentItem = media[currentIndex];

  if (!currentItem) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = currentItem.content_url;
    link.download = currentItem.filename;
    link.click();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.95)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top Actions */}
      <div style={{
        position: 'absolute',
        top: 20,
        right: 20,
        display: 'flex',
        gap: '16px',
        zIndex: 1010
      }}>
        <button className="btn-icon" onClick={handleDownload} title="Download">
          <Download size={24} color="white" />
        </button>
        <button className="btn-icon" onClick={() => onToggleFavorite(currentItem.id)} title="Favorite">
          <Heart size={24} color={currentItem.is_favorite ? "#FF3B30" : "white"} fill={currentItem.is_favorite ? "#FF3B30" : "transparent"} />
        </button>
        <button className="btn-icon" onClick={() => setShowInfo(!showInfo)} title="Info">
          <Info size={24} color="white" />
        </button>
        <button className="btn-icon" onClick={() => onDelete(currentItem.id)} title="Delete">
          <Trash2 size={24} color="white" />
        </button>
        <button className="btn-icon" onClick={onClose} title="Close">
          <X size={24} color="white" />
        </button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
        {currentItem.media_type === 'image' ? (
          <img 
            src={currentItem.content_url} 
            alt={currentItem.filename}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        ) : (
          <video 
            src={currentItem.content_url} 
            controls
            autoPlay
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          />
        )}
      </div>

      {/* Info Panel Overlay */}
      {showInfo && (
        <div className="glass-panel animate-fade-in" style={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          width: '300px',
          padding: '24px',
          color: 'white',
          zIndex: 1010
        }}>
          <h3 style={{ marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '8px' }}>Details</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#aaa' }}>Date Taken</span>
            <span>{new Date(currentItem.created_at).toLocaleDateString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#aaa' }}>Size</span>
            <span>{formatBytes(currentItem.file_size)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#aaa' }}>Resolution</span>
            <span>{currentItem.width} x {currentItem.height}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#aaa' }}>Format</span>
            <span>{currentItem.media_type}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaViewer;
