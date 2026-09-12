import React, { useState } from 'react';
import { X, Info, Download, Trash2, Heart, Share2, Copy } from 'lucide-react';
import { apiClient } from '../api/client';
import AuthenticatedImage from './AuthenticatedImage';
import AuthenticatedVideo from './AuthenticatedVideo';

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
  const [showInfo, setShowInfo] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const currentItem = media[currentIndex];

  if (!currentItem) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = currentItem.content_url;
    link.download = currentItem.filename;
    link.click();
  };

  const handleShare = async () => {
    try {
      const response = await apiClient.post(`/media/${currentItem.id}/share/`);
      setShareLink(response.data.url);
    } catch (err) {
      console.error('Failed to generate share link', err);
    }
  };

  const copyToClipboard = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      alert('Link copied to clipboard!');
      setShareLink(null);
    }
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
        <button className="btn-icon" onClick={handleShare} title="Share Publicly">
          <Share2 size={24} color="white" />
        </button>
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
          <AuthenticatedImage 
            src={currentItem.content_url} 
            alt={currentItem.filename}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        ) : (
          <AuthenticatedVideo 
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

      {/* Share Link Modal */}
      {shareLink && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--glass-border)',
          borderRadius: '16px',
          padding: '24px',
          width: '90%',
          maxWidth: '400px',
          zIndex: 2000,
          color: 'white',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Share Public Link</h3>
            <button className="btn-icon" onClick={() => setShareLink(null)}>
              <X size={20} color="white" />
            </button>
          </div>
          <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '16px' }}>Anyone with this link can view this media.</p>
          
          <div style={{ 
            display: 'flex', 
            background: 'rgba(0,0,0,0.3)', 
            borderRadius: '8px', 
            border: '1px solid rgba(255,255,255,0.1)',
            overflow: 'hidden'
          }}>
            <input 
              type="text" 
              value={shareLink} 
              readOnly 
              style={{ 
                flex: 1, 
                background: 'transparent', 
                border: 'none', 
                color: 'white', 
                padding: '12px',
                outline: 'none'
              }} 
            />
            <button 
              onClick={copyToClipboard}
              style={{
                background: 'var(--primary-color)',
                border: 'none',
                padding: '0 16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Copy size={18} color="white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaViewer;
