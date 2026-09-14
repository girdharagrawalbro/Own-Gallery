import { memo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ImageOff } from 'lucide-react';

interface MediaImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: CSSProperties;
  fit?: 'cover' | 'contain';
  /** Eager for above-the-fold / viewer images, lazy for grid cells. */
  loading?: 'lazy' | 'eager';
  /** Hide the broken-image icon (e.g. while a thumbnail is still being generated). */
  hideErrorIcon?: boolean;
  draggable?: boolean;
}

type LoadState = 'loading' | 'loaded' | 'error';

const ImageInner = ({ src, alt, className, style, fit = 'cover', loading = 'lazy', hideErrorIcon, draggable }: MediaImageProps) => {
  const [state, setState] = useState<LoadState>(src ? 'loading' : 'error');

  return (
    <div className={`media-image ${state === 'loaded' ? 'is-loaded' : ''} ${className ?? ''}`} style={style}>
      {src && state !== 'error' && (
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          draggable={draggable}
          style={{ objectFit: fit }}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
        />
      )}
      {state === 'error' && !hideErrorIcon && (
        <div className="media-image-fallback" aria-label="Image unavailable">
          <ImageOff size={24} strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
};

/**
 * Plain <img> for signed media URLs: neutral placeholder, fade-in on load, fallback icon on error.
 * Keyed on src so state resets when the URL changes.
 */
const MediaImage = (props: MediaImageProps) => <ImageInner key={props.src ?? ''} {...props} />;

export default memo(MediaImage);
