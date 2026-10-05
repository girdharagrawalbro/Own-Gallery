import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Users, X, Check } from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import LibraryView from '../components/LibraryView';
import { useMediaCollection } from '../hooks/useMediaCollection';
import type { PageFetcher } from '../hooks/useMediaCollection';
import type { Person } from '../types/people';
import { showToast } from '../utils/toast';

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
      <img src={cover_thumbnail_url} alt={person.display_name} className="people-avatar-img" draggable={false} />
    );
  }
  const { box_top, box_right, box_bottom, box_left } = cover_face;
  const faceW = box_right - box_left;
  const faceH = box_bottom - box_top;
  const scale = 1 / Math.max(faceW, faceH);
  const imgSize = AVATAR_SIZE * scale;
  return (
    <div className="people-avatar-crop">
      <img
        src={cover_thumbnail_url}
        alt={person.display_name}
        draggable={false}
        style={{
          width: `${imgSize}px`,
          height: `${imgSize}px`,
          marginLeft: `${-box_left * imgSize}px`,
          marginTop: `${-box_top * imgSize}px`,
          display: 'block',
        }}
      />
    </div>
  );
};

const PersonContent = ({ personId }: { personId: string }) => {
  const navigate = useNavigate();
  const [person, setPerson] = useState<Person | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const fetchPage = useMemo<PageFetcher>(
    () => (page) =>
      api.getPersonMedia(personId, page).then((res) => ({
        results: res.results,
        hasMore: !!res.next,
        count: res.count,
      })),
    [personId],
  );
  const collection = useMediaCollection(fetchPage);

  useEffect(() => {
    let cancelled = false;
    api.getPerson(personId).then((p) => {
      if (!cancelled) { setPerson(p); setNameInput(p.name); }
    }).catch((err: unknown) => {
      if (!cancelled) { showToast(getErrorMessage(err, 'Person not found'), 'error'); navigate('/people'); }
    });
    return () => { cancelled = true; };
  }, [personId, navigate]);

  const handleSaveName = async () => {
    if (!person) return;
    setSavingName(true);
    try {
      const updated = await api.renamePerson(person.id, nameInput);
      setPerson(updated);
      setEditingName(false);
      showToast('Name saved');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to save name'), 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleHide = async () => {
    if (!person || !window.confirm('Hide this person from People view?')) return;
    try {
      await api.updatePerson(person.id, { is_hidden: true });
      showToast('Person hidden');
      navigate('/people');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to hide'), 'error');
    }
  };

  return (
    <div className="person-detail-page">
      <div className="person-detail-header">
        <Link to="/people" className="btn-icon" aria-label="Back">
          <ArrowLeft size={22} />
        </Link>

        <div className="person-detail-profile">
          <div className="person-detail-avatar">
            {person ? <FaceAvatar person={person} /> : <div className="people-avatar-placeholder" />}
          </div>

          {editingName ? (
            <div className="person-name-edit">
              <input
                className="person-name-input"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                autoFocus
                placeholder="Add name"
              />
              <button className="btn-icon" onClick={handleSaveName} disabled={savingName} title="Save name">
                <Check size={18} />
              </button>
              <button className="btn-icon" onClick={() => setEditingName(false)} title="Cancel">
                <X size={18} />
              </button>
            </div>
          ) : (
            <button className="person-name-btn" onClick={() => setEditingName(true)}>
              <h1>{person?.display_name ?? '…'}</h1>
              <Pencil size={15} />
            </button>
          )}

          <p className="person-detail-count">{person?.media_count ?? 0} photos</p>
        </div>

        <div style={{ flex: 1 }} />

        <button className="text-btn" onClick={handleHide} style={{ color: '#e53935', fontSize: 14 }}>
          Hide person
        </button>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <LibraryView
          collection={collection}
          empty={{
            icon: <Users size={48} />,
            title: 'No photos for this person',
            description: 'Face grouping assigns photos automatically.',
          }}
        />
      </div>
    </div>
  );
};

const PersonDetail = () => {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <PersonContent key={id} personId={id} />;
};

export default PersonDetail;
