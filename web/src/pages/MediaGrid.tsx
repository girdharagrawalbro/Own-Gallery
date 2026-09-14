import { useMemo } from 'react';
import { Upload } from 'lucide-react';
import { api } from '../api/client';
import LibraryView from '../components/LibraryView';
import { useUploadActions, useUploadCompleted } from '../context/uploads';
import { useMediaCollection } from '../hooks/useMediaCollection';
import type { PageFetcher } from '../hooks/useMediaCollection';

const fetchAll: PageFetcher = (page) =>
  api.listMedia({}, page).then((res) => ({ results: res.results, hasMore: !!res.next, count: res.count }));

const MediaGrid = () => {
  const collection = useMediaCollection(fetchAll);
  const { openFilePicker } = useUploadActions();

  // Insert freshly processed uploads without reloading the page.
  useUploadCompleted(collection.upsert);

  const empty = useMemo(
    () => ({
      title: 'No photos yet',
      description: 'Drag photos and videos anywhere on this page, or use the Upload button.',
      action: (
        <button className="btn-primary" onClick={openFilePicker}>
          <Upload size={18} /> Upload photos
        </button>
      ),
    }),
    [openFilePicker],
  );

  return <LibraryView collection={collection} empty={empty} />;
};

export default MediaGrid;
