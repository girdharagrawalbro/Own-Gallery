import { useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Heart, Info, Share2, Trash2 } from 'lucide-react';
import type { Media } from '../types/media';
import MediaInfoPanel from './MediaInfoPanel';
import ShareLinkModal from './ShareLinkModal';
import { ViewerImage, ViewerVideo } from './ViewerMedia';

interface MediaViewerProps {
  items: Media[];
  currentId: number;
  onNavigate: (id: number) => void;
  onClose: () => void;
  onToggleFavorite?: (id: number) => void;
  /** Resolves true when the item was trashed. */
  onTrash?: (id: number) => Promise<boolean>;
}

const SWIPE_THRESHOLD = 50;

const MediaViewer = ({ items, currentId, onNavigate, onClose, onToggleFavorite, onTrash }: MediaViewerProps) => {
  const [showInfo, setShowInfo] = useState(() => {
    try {
      return window.innerWidth >= 1100 && localStorage.getItem('viewer_info') === '1';
    } catch {
      return false;
    }
  });
  const [shareId, setShareId] = useState<number | null>(null);
  const [zoomedId, setZoomedId] = useState<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // A single findIndex per render (not inside a loop).
  const index = items.findIndex((m) => m.id === currentId);
  const item = index >= 0 ? items[index] : null;
  const prev = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;
  const zoomed = item !== null && zoomedId === item.id;

  // The item disappeared from the list (e.g. removed elsewhere): close.
  useEffect(() => {
    if (!item) onClose();
  }, [item, onClose]);

  // Lock page scroll while open.
  useEffect(() => {
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    body.classList.add('viewer-open');
    return () => {
      body.style.overflow = previousOverflow;
      body.classList.remove('viewer-open');
    };
  }, []);

  // Preload neighbours so next/prev feel instant.
  useEffect(() => {
    for (const neighbour of [next, prev]) {
      if (!neighbour) continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = neighbour.preview_url;
    }
  }, [next, prev]);

  const latest = useRef({ prev, next, zoomed, shareId, onNavigate, onClose });
  useEffect(() => {
    latest.current = { prev, next, zoomed, shareId, onNavigate, onClose };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = latest.current;
      if (s.shareId !== null) return; // the modal handles its own keys
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (s.zoomed) setZoomedId(null);
        else s.onClose();
      } else if (e.key === 'ArrowRight' && s.next) {
        e.preventDefault();
        s.onNavigate(s.next.id);
      } else if (e.key === 'ArrowLeft' && s.prev) {
        e.preventDefault();
        s.onNavigate(s.prev.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!item) return null;

  const toggleInfo = () => {
    const nextValue = !showInfo;
    setShowInfo(nextValue);
    try {
      localStorage.setItem('viewer_info', nextValue ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  };

  const handleTrash = async () => {
    if (!onTrash || !window.confirm('Move this item to trash?')) return;
    const fallback = next ?? prev;
    if (fallback) onNavigate(fallback.id);
    const ok = await onTrash(item.id);
    if (!ok && fallback) onNavigate(item.id);
    else if (ok && !fallback) onClose();
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1 || zoomed) return;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || zoomed) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && next) onNavigate(next.id);
    else if (dx > 0 && prev) onNavigate(prev.id);
  };

  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={item.filename}>
      <div className="viewer-main">
        <div className="viewer-topbar">
          <button className="viewer-btn" onClick={onClose} title="Back" aria-label="Back">
            <ArrowLeft size={22} />
          </button>
          <div className="viewer-actions">
            <button className="viewer-btn" onClick={() => setShareId(item.id)} title="Share" aria-label="Share">
              <Share2 size={20} />
            </button>
            <a className="viewer-btn" href={item.download_url} title="Download" aria-label="Download">
              <Download size={20} />
            </a>
            {onToggleFavorite && (
              <button
                className={`viewer-btn${item.is_favorite ? ' is-active' : ''}`}
                onClick={() => onToggleFavorite(item.id)}
                title={item.is_favorite ? 'Remove from favorites' : 'Favorite'}
                aria-label={item.is_favorite ? 'Remove from favorites' : 'Favorite'}
                aria-pressed={item.is_favorite}
              >
                <Heart size={20} fill={item.is_favorite ? 'currentColor' : 'none'} />
              </button>
            )}
            <button
              className={`viewer-btn${showInfo ? ' is-active' : ''}`}
              onClick={toggleInfo}
              title="Info"
              aria-label="Info"
              aria-pressed={showInfo}
            >
              <Info size={20} />
            </button>
            {onTrash && (
              <button className="viewer-btn" onClick={handleTrash} title="Move to trash" aria-label="Move to trash">
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>

        <div className="viewer-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {item.media_type === 'video' ? (
            <ViewerVideo key={item.id} item={item} />
          ) : (
            <ViewerImage
              key={item.id}
              item={item}
              zoomed={zoomed}
              onToggleZoom={() => setZoomedId(zoomed ? null : item.id)}
            />
          )}
        </div>

        {prev && !zoomed && (
          <button className="viewer-nav viewer-nav-prev" onClick={() => onNavigate(prev.id)} aria-label="Previous">
            <ChevronLeft size={32} />
          </button>
        )}
        {next && !zoomed && (
          <button className="viewer-nav viewer-nav-next" onClick={() => onNavigate(next.id)} aria-label="Next">
            <ChevronRight size={32} />
          </button>
        )}
      </div>

      {showInfo && <MediaInfoPanel item={item} onClose={toggleInfo} />}
      {shareId !== null && <ShareLinkModal mediaId={shareId} onClose={() => setShareId(null)} />}
    </div>,
    document.body,
  );
};

export default MediaViewer;
