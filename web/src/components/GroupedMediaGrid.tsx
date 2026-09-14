import React, { useRef, useEffect } from 'react';
import type { MediaItem } from '../utils/dateUtils';
import { groupMediaByDate } from '../utils/dateUtils';
import { Play, Check, Image as ImageIcon } from 'lucide-react';
import AuthenticatedImage from './AuthenticatedImage';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

interface GroupedMediaGridProps {
  media: MediaItem[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  isSelectionMode: boolean;
  selectedIds: number[];
  onToggleSelection: (id: number) => void;
  onItemClick: (index: number) => void;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}

const GroupedMediaGrid: React.FC<GroupedMediaGridProps> = ({
  media,
  loading,
  hasMore,
  onLoadMore,
  isSelectionMode,
  selectedIds,
  onToggleSelection,
  onItemClick,
  emptyIcon = <ImageIcon size={48} color="var(--text-secondary)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />,
  emptyTitle = "No photos yet",
  emptyDescription = "Upload some photos or videos to get started."
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isIntersecting = useIntersectionObserver(sentinelRef, { threshold: 0.1 });

  useEffect(() => {
    if (isIntersecting && hasMore && !loading) {
      onLoadMore();
    }
  }, [isIntersecting, hasMore, loading, onLoadMore]);

  if (media.length === 0 && !loading) {
    return (
      <div className="glass-panel animate-fade-in" style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--bg-secondary)', border: 'none' }}>
        {emptyIcon}
        <h2 style={{ fontSize: '18px', fontWeight: '500' }}>{emptyTitle}</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>{emptyDescription}</p>
      </div>
    );
  }

  const groups = groupMediaByDate(media);
  
  // Need to map the flat index back to the item for the viewer
  // Since we grouped them, we must keep track of the original index in the media array
  const getItemIndex = (id: number) => media.findIndex(m => m.id === id);

  return (
    <div>
      {groups.map((group) => (
        <div key={group.dateStr} style={{ marginBottom: '32px' }}>
          <h2 style={{ 
            fontSize: '16px', 
            fontWeight: '500', 
            color: 'var(--text-primary)', 
            marginBottom: '16px',
            paddingLeft: '4px'
          }}>
            {group.dateStr}
          </h2>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '8px'
          }}>
            {group.items.map((item, index) => {
              const originalIndex = getItemIndex(item.id);
              const isSelected = selectedIds.includes(item.id);
              
              return (
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
                      onToggleSelection(item.id);
                    } else {
                      onItemClick(originalIndex);
                    }
                  }}
                >
                  <AuthenticatedImage
                    src={item.thumbnail_url || (item.media_type === 'video' ? '' : item.content_url)}
                    alt={item.filename}
                    style={{ 
                      width: '100%', height: '100%', objectFit: 'cover',
                      transform: isSelected ? 'scale(0.85)' : 'scale(1)',
                      transition: 'transform 0.2s',
                      borderRadius: isSelected ? '8px' : '0'
                    }}
                  />
                  
                  {isSelectionMode && (
                    <div style={{
                      position: 'absolute', top: '8px', left: '8px', width: '20px', height: '20px',
                      borderRadius: '50%', border: '2px solid white',
                      background: isSelected ? 'var(--accent-color)' : 'rgba(0,0,0,0.3)',
                      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10
                    }}>
                      {isSelected && <Check size={12} color="white" />}
                    </div>
                  )}
                  {item.media_type === 'video' && (
                    <div style={{ position: 'absolute', top: '8px', right: '8px', color: 'white', background: 'rgba(0,0,0,0.3)', borderRadius: '50%', padding: '4px' }}>
                      <Play fill="white" size={12} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      
      {/* Loading Sentinel */}
      <div 
        ref={sentinelRef} 
        style={{ 
          height: '40px', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          marginTop: '20px'
        }}
      >
        {loading && <span style={{ color: 'var(--text-secondary)' }}>Loading more...</span>}
      </div>
    </div>
  );
};

export default GroupedMediaGrid;
