import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Calendar, Download, FolderPlus, Heart, HeartOff, Trash2 } from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import type { MediaCollection } from '../hooks/useMediaCollection';
import type { Album, Media } from '../types/media';
import { downloadMedia } from '../utils/download';
import { showToast } from '../utils/toast';
import MediaViewer from './MediaViewer';
import SelectAlbumModal from './SelectAlbumModal';
import SelectionBar, { SelectionAction } from './SelectionBar';
import TimelineGrid from './TimelineGrid';
import type { EmptyState } from './TimelineGrid';

interface LibraryViewProps {
  collection: MediaCollection;
  empty: EmptyState;
  header?: ReactNode;
  /** Items hidden from the grid (but kept for the open viewer), e.g. un-favorited items on Favorites. */
  gridFilter?: (item: Media) => boolean;
  /** Extra actions for the selection bar (e.g. "Remove from album"). */
  renderExtraActions?: (ids: number[], clearSelection: () => void) => ReactNode;
  /** Date extractor for day-grouping headers. Defaults to photo date. */
  dateOf?: (m: Media) => Date;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Timeline grid + selection bar + viewer, shared by Photos, Favorites, Search and albums. */
const LibraryView = ({ collection, empty, header, gridFilter, renderExtraActions, dateOf }: LibraryViewProps) => {
  const { items } = collection;
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const [viewerId, setViewerId] = useState<number | null>(null);
  // Ids visible in the grid when the viewer opened: items hidden by gridFilter during the
  // viewing session (e.g. un-favorited) stay navigable until the viewer closes.
  const [viewerKeep, setViewerKeep] = useState<ReadonlySet<number>>(() => new Set());
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);

  const gridItems = useMemo(() => (gridFilter ? items.filter(gridFilter) : items), [items, gridFilter]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const closeViewer = useCallback(() => setViewerId(null), []);
  const openViewer = useCallback(
    (id: number) => {
      if (gridFilter) setViewerKeep(new Set(gridItems.map((m) => m.id)));
      setViewerId(id);
    },
    [gridFilter, gridItems],
  );
  const viewerItems = useMemo(
    () => (gridFilter ? items.filter((m) => gridFilter(m) || viewerKeep.has(m.id)) : items),
    [items, gridFilter, viewerKeep],
  );

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const selectedItems = useMemo(() => items.filter((m) => selected.has(m.id)), [items, selected]);
  const allFavorite = selectedItems.length > 0 && selectedItems.every((m) => m.is_favorite);

  const handleFavorite = async () => {
    const ok = await collection.setFavorite(selectedIds, !allFavorite);
    if (ok) {
      showToast(allFavorite ? 'Removed from favorites' : `Added ${plural(selectedIds.length, 'item')} to favorites`);
      clearSelection();
    }
  };

  const handleTrash = async () => {
    if (!window.confirm(`Move ${plural(selectedIds.length, 'item')} to trash?`)) return;
    const ids = selectedIds;
    clearSelection();
    if (await collection.trash(ids)) showToast(`Moved ${plural(ids.length, 'item')} to trash`);
  };

  const handleBulkDateChange = async () => {
    const dateStr = window.prompt(`Set new date and time for ${plural(selectedIds.length, 'item')} (YYYY-MM-DD HH:MM):`);
    if (!dateStr) return;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      showToast('Invalid date format', 'error');
      return;
    }
    const ids = selectedIds;
    clearSelection();
    try {
      await api.bulkUpdateTakenAt(ids, date);
      // Optimistically update collection items
      if (collection.mutate) {
        collection.mutate(items.map(m => ids.includes(m.id) ? { ...m, taken_at: date.toISOString() } : m));
      }
      showToast(`Updated date for ${plural(ids.length, 'item')}`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update date'), 'error');
    }
  };

  const handleAddToAlbum = async (album: Album) => {
    setAlbumPickerOpen(false);
    try {
      await api.addToAlbum(album.id, selectedIds);
      showToast(`Added ${plural(selectedIds.length, 'item')} to “${album.name}”`);
      clearSelection();
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not add to album'), 'error');
    }
  };

  const handleUpdateTakenAt = async (id: number, date: Date) => {
    try {
      await api.updateTakenAt(id, date);
      if (collection.mutate) {
        collection.mutate(items.map((m) => (m.id === id ? { ...m, taken_at: date.toISOString() } : m)));
      }
      showToast('Date updated');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update date'), 'error');
    }
  };

  return (
    <div className="library">
      {header}

      <TimelineGrid
        items={gridItems}
        loading={collection.loading}
        initialLoading={collection.initialLoading}
        hasMore={collection.hasMore}
        error={collection.error}
        onLoadMore={collection.loadMore}
        selected={selected}
        onSelectedChange={setSelected}
        onOpen={openViewer}
        empty={empty}
        dateOf={dateOf}
      />

      <SelectionBar count={selected.size} onClear={clearSelection}>
        {renderExtraActions?.(selectedIds, clearSelection)}
        <SelectionAction icon={<FolderPlus size={20} />} label="Add to album" onClick={() => setAlbumPickerOpen(true)} />
        <SelectionAction
          icon={allFavorite ? <HeartOff size={20} /> : <Heart size={20} />}
          label={allFavorite ? 'Remove from favorites' : 'Favorite'}
          onClick={handleFavorite}
        />
        <SelectionAction icon={<Calendar size={20} />} label="Edit date" onClick={handleBulkDateChange} />
        <SelectionAction icon={<Download size={20} />} label="Download" onClick={() => downloadMedia(selectedItems)} />
        <SelectionAction icon={<Trash2 size={20} />} label="Move to trash" onClick={handleTrash} />
      </SelectionBar>


      {albumPickerOpen && <SelectAlbumModal onClose={() => setAlbumPickerOpen(false)} onSelect={handleAddToAlbum} />}

      {viewerId !== null && (
        <MediaViewer
          items={viewerItems}
          currentId={viewerId}
          onNavigate={setViewerId}
          onClose={closeViewer}
          onToggleFavorite={collection.toggleFavorite}
          onTrash={(id) => collection.trash([id])}
          onUpdateTakenAt={handleUpdateTakenAt}
        />
      )}
    </div>
  );
};

export default LibraryView;
