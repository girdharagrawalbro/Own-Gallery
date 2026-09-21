import { useCallback, useMemo, useState } from 'react';
import { CalendarDays, Clock, Upload } from 'lucide-react';
import { api } from '../api/client';
import LibraryView from '../components/LibraryView';
import { useUploadActions, useUploadCompleted } from '../context/uploads';
import { useMediaCollection } from '../hooks/useMediaCollection';
import type { PageFetcher } from '../hooks/useMediaCollection';
import { mediaAddedDate } from '../utils/dateUtils';
import type { MediaOrdering } from '../types/media';
import type { Media } from '../types/media';
import MemoriesCarousel from '../components/MemoriesCarousel';

const makeFetcher =
  (ordering: MediaOrdering): PageFetcher =>
  (page) =>
    api
      .listMedia({ ordering }, page)
      .then((res) => ({ results: res.results, hasMore: !!res.next, count: res.count }));

const ADDED_DATE_OF = (m: Media) => mediaAddedDate(m);

const MediaGrid = () => {
  const [ordering, setOrdering] = useState<MediaOrdering>('date');
  const fetcher = useMemo(() => makeFetcher(ordering), [ordering]);
  // Remount the collection (key) when ordering changes so pagination restarts cleanly.
  const collection = useMediaCollection(fetcher);
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

  const handleOrdering = useCallback((o: MediaOrdering) => {
    setOrdering(o);
  }, []);

  const header = (
    <div className="grid-header">
      <MemoriesCarousel />
      <div className="filters-row">
        <div className="pill-filters">
          <button className="pill-btn active">All</button>
          <button className="pill-btn">Videos</button>
          <button className="pill-btn">Screenshots</button>
          <button className="pill-btn">Selfies</button>
        </div>
      </div>
      <div className="sort-toggle" role="group" aria-label="Sort order">
        <button
          id="sort-date-taken"
          className={`sort-toggle-btn${ordering === 'date' ? ' active' : ''}`}
          onClick={() => handleOrdering('date')}
          aria-pressed={ordering === 'date'}
        >
          <CalendarDays size={14} />
          Date taken
        </button>
        <button
          id="sort-recently-added"
          className={`sort-toggle-btn${ordering === 'added' ? ' active' : ''}`}
          onClick={() => handleOrdering('added')}
          aria-pressed={ordering === 'added'}
        >
          <Clock size={14} />
          Recently added
        </button>
      </div>
    </div>
  );

  return (
    <LibraryView
      key={ordering}
      collection={collection}
      empty={empty}
      header={header}
      dateOf={ordering === 'added' ? ADDED_DATE_OF : undefined}
    />
  );
};

export default MediaGrid;
