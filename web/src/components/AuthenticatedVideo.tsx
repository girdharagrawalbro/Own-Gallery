import React, { useEffect, useState } from 'react';
import { VideoOff } from 'lucide-react';

interface AuthenticatedVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
}

const AuthenticatedVideo: React.FC<AuthenticatedVideoProps> = ({ src, style, ...props }) => {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Get token from local storage directly for simplicity
    const localToken = localStorage.getItem('auth_token');
    setToken(localToken);
  }, []);

  if (!src) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.08) 100%)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <VideoOff size={28} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
      </div>
    );
  }

  if (!token) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
        <div className="spinner" style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      </div>
    );
  }

  // Ensure src uses the correct full base URL if it's a relative path
  const fullSrc = src.startsWith('http') 
    ? src 
    : `${import.meta.env.VITE_API_URL || 'https://own-gallery-api.ambitioushill-a50180b1.koreacentral.azurecontainerapps.io/api'}${src.replace('/api', '')}`;
    
  const separator = fullSrc.includes('?') ? '&' : '?';
  const streamingUrl = `${fullSrc}${separator}token=${token}`;

  return <video src={streamingUrl} style={style} {...props} />;
};

export default AuthenticatedVideo;
