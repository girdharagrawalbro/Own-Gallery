import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { Media } from '../types/media';

/* ------------------------------------------------------------------ */
/* Image: thumbnail (cached) -> preview -> original when zoomed        */
/* ------------------------------------------------------------------ */

interface ViewerImageProps {
  item: Media;
  zoomed: boolean;
  onToggleZoom: () => void;
}

const canRenderOriginal = (item: Media) => !/hei[cf]|dng|tiff?/i.test(item.mime_type);

export const ViewerImage = ({ item, zoomed, onToggleZoom }: ViewerImageProps) => {
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [originalLoaded, setOriginalLoaded] = useState(false);
  const [originalFailed, setOriginalFailed] = useState(false);
  const zoomRef = useRef<HTMLDivElement>(null);
  const focusPoint = useRef({ x: 0.5, y: 0.5 });

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!zoomed) {
      const target = e.currentTarget.getBoundingClientRect();
      focusPoint.current = {
        x: (e.clientX - target.left) / target.width,
        y: (e.clientY - target.top) / target.height,
      };
    }
    onToggleZoom();
  };

  const centerOnFocus = () => {
    const el = zoomRef.current;
    if (!el) return;
    el.scrollLeft = focusPoint.current.x * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = focusPoint.current.y * el.scrollHeight - el.clientHeight / 2;
  };

  if (zoomed) {
    const src = canRenderOriginal(item) && !originalFailed ? item.content_url : item.preview_url;
    return (
      <div ref={zoomRef} className="viewer-zoom" onClick={handleClick}>
        <img
          src={src}
          alt={item.filename}
          decoding="async"
          draggable={false}
          onLoad={() => {
            setOriginalLoaded(true);
            centerOnFocus();
          }}
          onError={() => setOriginalFailed(true)}
        />
        {!originalLoaded && <img className="viewer-zoom-placeholder" src={item.preview_url} alt="" draggable={false} />}
        {!originalLoaded && (
          <div className="viewer-loading">
            <LoaderCircle size={32} className="spin" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="viewer-image" onClick={handleClick}>
      {!previewLoaded && (
        <img
          className={`viewer-img${previewFailed ? '' : ' viewer-img-thumb'}`}
          src={item.thumbnail_url}
          alt={previewFailed ? item.filename : ''}
          draggable={false}
        />
      )}
      {!previewFailed && (
        <img
          className={`viewer-img viewer-img-preview${previewLoaded ? ' is-loaded' : ''}`}
          src={item.preview_url}
          alt={item.filename}
          decoding="async"
          draggable={false}
          onLoad={() => setPreviewLoaded(true)}
          onError={() => setPreviewFailed(true)}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Video                                                               */
/* ------------------------------------------------------------------ */

export const ViewerVideo = ({ item }: { item: Media }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Stop playback and abort the download when navigating away / closing. Deferred and guarded
  // by isConnected so a StrictMode effect re-run doesn't cancel autoplay on a live element.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (!video) return;
      window.setTimeout(() => {
        if (video.isConnected) return;
        video.pause();
        video.removeAttribute('src');
        video.load();
      }, 0);
    };
  }, []);

  return (
    <div className="viewer-video-wrap">
      <video
        ref={videoRef}
        className="viewer-video"
        src={item.content_url}
        poster={item.preview_url}
        preload="metadata"
        playsInline
        controls
        autoPlay
      />
    </div>
  );
};
