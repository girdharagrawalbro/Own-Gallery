import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { apiClient } from '../api/client';

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

const AuthenticatedImage: React.FC<AuthenticatedImageProps> = ({ src, style, ...props }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let isMounted = true;

    const fetchImage = async () => {
      if (!src) {
        if (isMounted) setError(true);
        return;
      }
      try {
        const response = await apiClient.get(src, { responseType: 'blob' });
        const blob = response.data;
        if (isMounted) {
          url = URL.createObjectURL(blob);
          setObjectUrl(url);
        }
      } catch (err) {
        console.error('Failed to load authenticated image', err);
        if (isMounted) setError(true);
      }
    };

    fetchImage();

    return () => {
      isMounted = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [src]);

  if (error) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.08) 100%)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <ImageOff size={28} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
        <div className="spinner" style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      </div>
    );
  }

  return <img src={objectUrl} style={style} {...props} />;
};

export default AuthenticatedImage;
