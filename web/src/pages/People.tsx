import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ScanFace, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../api/client';
import type { Person } from '../types/people';

const AVATAR_SIZE = 96;

const FaceAvatar = ({ person }: { person: Person }) => {
  const { cover_thumbnail_url, cover_face, cover_face_url } = person;
  const [faceUrlFailed, setFaceUrlFailed] = useState(false);

  if (cover_face_url && !faceUrlFailed) {
    return (
      <img
        src={cover_face_url}
        alt={person.display_name}
        className="people-avatar-img"
        loading="lazy"
        draggable={false}
        onError={() => setFaceUrlFailed(true)}
      />
    );
  }

  if (!cover_thumbnail_url) {
    return (
      <div className="people-avatar-placeholder">
        <Users size={36} />
      </div>
    );
  }

  if (!cover_face) {
    return (
      <img
        src={cover_thumbnail_url}
        alt={person.display_name}
        className="people-avatar-img"
        draggable={false}
      />
    );
  }

  // Crop to bounding box
  const { box_top, box_right, box_bottom, box_left } = cover_face;
  const faceW = box_right - box_left;
  const faceH = box_bottom - box_top;
  const scale = 1 / Math.max(faceW, faceH);
  const imgSize = AVATAR_SIZE * scale;
  const offsetX = -box_left * imgSize;
  const offsetY = -box_top * imgSize;

  return (
    <div className="people-avatar-crop">
      <img
        src={cover_thumbnail_url}
        alt={person.display_name}
        draggable={false}
        style={{
          width: `${imgSize}px`,
          height: `${imgSize}px`,
          marginLeft: `${offsetX}px`,
          marginTop: `${offsetY}px`,
          display: 'block',
        }}
      />
    </div>
  );
};

const PeoplePage = () => {
  const queryClient = useQueryClient();
  const [scanStatus, setScanStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const {
    data: people = null,
    error: rawError,
  } = useQuery<Person[]>({
    queryKey: ['people'],
    queryFn: () => api.listPeople(),
  });

  const scanMutation = useMutation({
    mutationFn: (force: boolean = false) => api.scanFaces(force),
    onSuccess: (data) => {
      setScanStatus({
        message: data.message || 'Face scan has been queued in the background.',
        type: 'success',
      });
      // Invalidate people query after a few seconds so any newly formed clusters show up
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['people'] });
      }, 5000);
    },
    onError: (err) => {
      setScanStatus({
        message: getErrorMessage(err, 'Failed to trigger face scan'),
        type: 'error',
      });
    },
  });

  const error = rawError ? getErrorMessage(rawError, 'Failed to load people') : null;

  return (
    <div className="library">
      <header className="page-header">
        <div>
          <h1>People &amp; Pets</h1>
          <p className="page-subtitle">Grouped automatically by facial recognition</p>
        </div>
        <button
          className="btn-outline"
          onClick={() => scanMutation.mutate(false)}
          disabled={scanMutation.isPending}
          title="Scan library for unscanned faces"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          {scanMutation.isPending ? (
            <RefreshCw size={16} className="spin" />
          ) : (
            <ScanFace size={16} />
          )}
          <span>{scanMutation.isPending ? 'Scanning...' : 'Scan for faces'}</span>
        </button>
      </header>

      {scanStatus && (
        <div
          style={{
            margin: '8px 0 16px',
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: scanStatus.type === 'success' ? '#e6f4ea' : '#fce8e6',
            color: scanStatus.type === 'success' ? '#137333' : '#c5221f',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          {scanStatus.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{scanStatus.message}</span>
          <button
            onClick={() => setScanStatus(null)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              fontSize: '16px',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>
      )}

      {error && <div className="inline-error">{error}</div>}

      {people === null ? (
        <div className="people-grid" aria-busy="true">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="people-card-skeleton">
              <div className="people-avatar-shimmer shimmer" />
              <div className="people-name-shimmer shimmer" />
            </div>
          ))}
        </div>
      ) : people.length === 0 ? (
        <div className="empty-state">
          <Users size={48} />
          <h2>No people yet</h2>
          <p>Face grouping runs in the background. If you recently uploaded photos, you can trigger a scan now.</p>
          <button
            className="btn-primary"
            style={{ marginTop: '16px' }}
            onClick={() => scanMutation.mutate(false)}
            disabled={scanMutation.isPending}
          >
            <ScanFace size={18} />
            <span>{scanMutation.isPending ? 'Scanning photos...' : 'Scan photos for faces'}</span>
          </button>
        </div>
      ) : (
        <div className="people-grid">
          {people.map((person) => (
            <Link key={person.id} to={`/people/${person.id}`} className="people-card">
              <div className="people-avatar-wrapper">
                <FaceAvatar person={person} />
              </div>
              <span className="people-name">{person.display_name}</span>
              <span className="people-count">{person.media_count} photos</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default PeoplePage;

