import { memo, useRef } from 'react';
import type { KeyboardEvent, MouseEvent, TouchEvent } from 'react';
import { Check, Heart, LoaderCircle, Play, TriangleAlert } from 'lucide-react';
import type { Media } from '../types/media';
import { formatDuration } from '../utils/dateUtils';
import MediaImage from './MediaImage';

export interface CellModifiers {
  shiftKey: boolean;
}

interface TimelineCellProps {
  item: Media;
  width: number;
  height: number;
  selected: boolean;
  selectionMode: boolean;
  onActivate: (id: number, mods: CellModifiers) => void;
  onToggle: (id: number, mods: CellModifiers) => void;
}

const LONG_PRESS_MS = 450;

const TimelineCell = ({ item, width, height, selected, selectionMode, onActivate, onToggle }: TimelineCellProps) => {
  const pressTimer = useRef<number | undefined>(undefined);
  const suppressClick = useRef(false);
  const isVideo = item.media_type === 'video';
  const processing = item.status === 'processing';
  const failed = item.status === 'failed';

  // Touch devices have no hover checkmark: long-press toggles selection instead.
  const cancelPress = () => window.clearTimeout(pressTimer.current);
  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    suppressClick.current = false;
    cancelPress();
    pressTimer.current = window.setTimeout(() => {
      suppressClick.current = true;
      navigator.vibrate?.(10);
      onToggle(item.id, { shiftKey: false });
    }, LONG_PRESS_MS);
  };

  const handleClick = (e: MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (e.shiftKey) e.preventDefault(); // avoid text selection on shift-click
    onActivate(item.id, { shiftKey: e.shiftKey });
  };
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate(item.id, { shiftKey: e.shiftKey });
    }
  };
  const handleCheck = (e: MouseEvent) => {
    e.stopPropagation();
    onToggle(item.id, { shiftKey: e.shiftKey });
  };

  return (
    <div
      className={`tl-cell${selected ? ' is-selected' : ''}${selectionMode ? ' is-selecting' : ''}`}
      style={{ width, height }}
      role="button"
      tabIndex={0}
      aria-label={`${isVideo ? 'Video' : 'Photo'} ${item.filename}`}
      aria-pressed={selectionMode ? selected : undefined}
      onClick={handleClick}
      onKeyDown={handleKey}
      onTouchStart={handleTouchStart}
      onTouchMove={cancelPress}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
      onContextMenu={(e) => {
        if (suppressClick.current) e.preventDefault();
      }}
    >
      <div className="tl-cell-media">
        <MediaImage src={item.thumbnail_url} alt={item.filename} hideErrorIcon={processing} draggable={false} />
        <div className="tl-cell-scrim" />
        {isVideo && (
          <span className="tl-badge tl-badge-video">
            {item.duration ? formatDuration(item.duration) : null}
            <Play size={12} fill="currentColor" />
          </span>
        )}
        {item.is_favorite && <Heart className="tl-fav" size={16} fill="currentColor" aria-label="Favorite" />}
        {processing && (
          <div className="tl-processing" title="Processing…">
            <LoaderCircle size={22} className="spin" />
          </div>
        )}
        {failed && (
          <span className="tl-badge tl-badge-failed" title={item.upload_error || 'Processing failed'}>
            <TriangleAlert size={13} />
          </span>
        )}
      </div>
      <button
        type="button"
        className="tl-check"
        onClick={handleCheck}
        aria-label={selected ? 'Deselect' : 'Select'}
        tabIndex={-1}
      >
        <Check size={14} strokeWidth={3} />
      </button>
    </div>
  );
};

export default memo(TimelineCell);
