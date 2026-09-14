import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FolderMinus, Image as ImageIcon, Trash2 } from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import LibraryView from '../components/LibraryView';
import { SelectionAction } from '../components/SelectionBar';
import { useMediaCollection } from '../hooks/useMediaCollection';
import type { PageFetcher } from '../hooks/useMediaCollection';
import type { Album } from '../types/media';
import { showToast } from '../utils/toast';

const AlbumContent = ({ albumId }: { albumId: string }) => {
  const navigate = useNavigate();
  const [album, setAlbum] = useState<Album | null>(null);

  const fetchPage = useMemo<PageFetcher>(
    () => (page) =>
      api.listMedia({ album: albumId }, page).then((res) => ({ results: res.results, hasMore: !!res.next, count: res.count })),
    [albumId],
  );
  const collection = useMediaCollection(fetchPage);

  useEffect(() => {
    let cancelled = false;
    api
      .getAlbum(albumId)
      .then((a) => {
        if (!cancelled) setAlbum(a);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        showToast(getErrorMessage(err, 'Album not found'), 'error');
        navigate('/albums', { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [albumId, navigate]);

  const handleDeleteAlbum = async () => {
    if (!window.confirm('Delete this album? The photos in it will stay in your library.')) return;
    try {
      await api.deleteAlbum(albumId);
      showToast('Album deleted');
      navigate('/albums');
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not delete album'), 'error');
    }
  };

  const handleRemove = async (ids: number[], clearSelection: () => void) => {
    clearSelection();
    const ok = await collection.removeOptimistic(ids, () => api.removeFromAlbum(albumId, ids), 'Could not remove from album');
    if (ok) showToast(`Removed ${ids.length} item${ids.length === 1 ? '' : 's'} from album`);
  };

  const count = collection.count;

  return (
    <LibraryView
      collection={collection}
      empty={{
        icon: <ImageIcon size={48} />,
        title: 'This album is empty',
        description: 'Select photos in your library and choose “Add to album”.',
      }}
      renderExtraActions={(ids, clear) => (
        <SelectionAction icon={<FolderMinus size={20} />} label="Remove from album" onClick={() => handleRemove(ids, clear)} />
      )}
      header={
        <header className="page-header album-header">
          <button className="btn-icon" onClick={() => navigate('/albums')} aria-label="Back to albums" title="Back to albums">
            <ArrowLeft size={22} />
          </button>
          <div className="album-header-text">
            <h1>{album?.name ?? ' '}</h1>
            <p className="page-subtitle">
              {album?.description ? `${album.description} · ` : ''}
              {count !== null ? `${count} item${count === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          <button className="btn-icon danger" onClick={handleDeleteAlbum} title="Delete album" aria-label="Delete album">
            <Trash2 size={20} />
          </button>
        </header>
      }
    />
  );
};

const AlbumDetail = () => {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <AlbumContent key={id} albumId={id} />;
};

export default AlbumDetail;
