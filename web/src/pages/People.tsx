import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import type { Person } from '../types/people';

const AVATAR_SIZE = 96;

const FaceAvatar = ({ person }: { person: Person }) => {
  const { cover_thumbnail_url, cover_face } = person;

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
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.listPeople().then((list) => {
      if (!cancelled) setPeople(list);
    }).catch((err: unknown) => {
      if (!cancelled) {
        setError(getErrorMessage(err, 'Failed to load people'));
        setPeople([]);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="library">
      <header className="page-header">
        <h1>People &amp; Pets</h1>
      </header>

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
          <p>Face grouping runs automatically in the background as you upload photos.</p>
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
