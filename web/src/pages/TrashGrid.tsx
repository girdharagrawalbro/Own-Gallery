import { useCallback, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import SelectionBar, { SelectionAction } from '../components/SelectionBar';
import TimelineGrid from '../components/TimelineGrid';
import { useMediaCollection } from '../hooks/useMediaCollection';
import type { PageFetcher } from '../hooks/useMediaCollection';
import { showToast } from '../utils/toast';

// GET /media/trash/ is not paginated.
const fetchTrash: PageFetcher = () => api.listTrash().then((results) => ({ results, hasMore: false, count: results.length }));

const EMPTY = {
  icon: <Trash2 size={48} />,
  title: 'Trash is empty',
  description: 'Items you move to trash will appear here.',
};

const TrashGrid = () => {
  const collection = useMediaCollection(fetchTrash);
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const { items, removeOptimistic } = collection;

  const runOnSelection = async (
    request: (id: number) => Promise<unknown>,
    verb: string,
    errorMessage: string,
  ) => {
    const ids = Array.from(selected);
    clearSelection();
    const ok = await removeOptimistic(ids, () => Promise.all(ids.map(request)), errorMessage);
    if (ok) showToast(`${verb} ${ids.length} item${ids.length === 1 ? '' : 's'}`);
  };

  const handleRestore = () => runOnSelection(api.restore, 'Restored', 'Could not restore');

  const handleDeleteForever = () => {
    if (!window.confirm(`Permanently delete ${selected.size} item${selected.size === 1 ? '' : 's'}? This can't be undone.`)) return;
    void runOnSelection(api.permanentDelete, 'Deleted', 'Could not delete');
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm("Permanently delete everything in trash? This can't be undone.")) return;
    const ids = items.map((m) => m.id);
    clearSelection();
    const ok = await removeOptimistic(ids, () => api.emptyTrash(), 'Could not empty trash');
    if (ok) showToast('Trash emptied');
  };

  return (
    <div className="library">
      <header className="page-header">
        <div>
          <h1>Trash</h1>
          <p className="page-subtitle">Items in trash are permanently deleted after 60 days.</p>
        </div>
        {items.length > 0 && (
          <button className="btn-outline danger" onClick={handleEmptyTrash}>
            Empty trash
          </button>
        )}
      </header>

      <TimelineGrid
        items={items}
        loading={collection.loading}
        initialLoading={collection.initialLoading}
        hasMore={collection.hasMore}
        error={collection.error}
        onLoadMore={collection.loadMore}
        selected={selected}
        onSelectedChange={setSelected}
        clickSelects
        empty={EMPTY}
      />

      <SelectionBar count={selected.size} onClear={clearSelection}>
        <SelectionAction icon={<RotateCcw size={20} />} label="Restore" onClick={handleRestore} />
        <SelectionAction icon={<Trash2 size={20} />} label="Delete forever" onClick={handleDeleteForever} danger />
      </SelectionBar>
    </div>
  );
};

export default TrashGrid;
