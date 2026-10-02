import { useCallback, useMemo, useState } from 'react';
import { Check, Info, Trash2, Shield, Play, Images, Video, Grid3X3, RotateCcw, X } from 'lucide-react';
import { api } from '../api/client';
import { useMediaCollection } from '../hooks/useMediaCollection';
import type { PageFetcher } from '../hooks/useMediaCollection';
import { showToast } from '../utils/toast';
import type { Media } from '../types/media';
import './Trash.css';

// GET /media/trash/ is not paginated.
const fetchTrash: PageFetcher = () => api.listTrash().then((results) => ({ results, hasMore: false, count: results.length }));

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const TrashGrid = () => {
  const collection = useMediaCollection(fetchTrash);
  const { items, removeOptimistic } = collection;
  
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const [filter, setFilter] = useState<'all' | 'photos' | 'videos'>('all');
  const [isSelectMode, setIsSelectMode] = useState(false);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setIsSelectMode(false);
  }, []);

  const runOnSelection = async (
    request: (id: number) => Promise<unknown>,
    verb: string,
    errorMessage: string,
  ) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    
    clearSelection();
    const ok = await removeOptimistic(ids, () => Promise.all(ids.map(request)), errorMessage);
    if (ok) showToast(`${verb} ${ids.length} item${ids.length === 1 ? '' : 's'}`);
  };

  const handleRestore = () => {
    if (selected.size === 0) {
      showToast('Select items to restore');
      return;
    }
    runOnSelection(api.restore, 'Restored', 'Could not restore');
  };

  const handleRestoreAll = async () => {
    if (items.length === 0) return;
    if (!window.confirm(`Restore all ${items.length} items from trash?`)) return;
    clearSelection();
    const ids = items.map(m => m.id);
    const ok = await removeOptimistic(ids, () => Promise.all(ids.map(api.restore)), 'Could not restore all items');
    if (ok) showToast(`Restored all ${ids.length} items`);
  };

  const handleDeleteForever = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    
    if (!window.confirm(`Permanently delete ${ids.length} item${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return;
    void runOnSelection(api.permanentDelete, 'Permanently deleted', 'Could not delete');
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm("Permanently delete everything in trash? This can't be undone.")) return;
    const ids = items.map((m) => m.id);
    clearSelection();
    const ok = await removeOptimistic(ids, () => api.emptyTrash(), 'Could not empty trash');
    if (ok) showToast('Trash emptied');
  };

  const toggleSelection = (id: number) => {
    if (!isSelectMode) {
      setIsSelectMode(true);
      setSelected(new Set([id]));
      return;
    }
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleToggleSelectMode = () => {
    if (isSelectMode) {
      clearSelection();
    } else {
      setIsSelectMode(true);
    }
  };

  // Compute stats
  const totalSize = items.reduce((acc, curr) => acc + curr.file_size, 0);
  const totalSizeMB = Math.round(totalSize / (1024 * 1024));
  
  const photoCount = items.filter(m => m.media_type === 'image').length;
  const videoCount = items.filter(m => m.media_type === 'video').length;

  const filteredItems = useMemo(() => {
    if (filter === 'photos') return items.filter(m => m.media_type === 'image');
    if (filter === 'videos') return items.filter(m => m.media_type === 'video');
    return items;
  }, [items, filter]);

  // Group by expiration
  const { expiringSoon, earlier } = useMemo(() => {
    const soon: (Media & { daysLeft: number })[] = [];
    const later: (Media & { daysLeft: number })[] = [];
    
    const now = new Date().getTime();
    
    filteredItems.forEach(item => {
      const deletedAt = item.deleted_at ? new Date(item.deleted_at).getTime() : now;
      const daysSinceDeleted = Math.floor((now - deletedAt) / (1000 * 60 * 60 * 24));
      // Trash retention is 30 days
      let daysLeft = 30 - daysSinceDeleted;
      if (daysLeft < 0) daysLeft = 0;
      if (daysLeft > 30) daysLeft = 30; // safety
      
      const enriched = { ...item, daysLeft };
      if (daysLeft <= 7) {
        soon.push(enriched);
      } else {
        later.push(enriched);
      }
    });
    
    // Sort ascending by days left
    soon.sort((a, b) => a.daysLeft - b.daysLeft);
    later.sort((a, b) => a.daysLeft - b.daysLeft);
    
    return { expiringSoon: soon, earlier: later };
  }, [filteredItems]);

  const renderBadge = (daysLeft: number) => {
    if (daysLeft <= 3) {
      return (
        <span className="trash-badge-days-inner trash-badge-days-urgent">
          {daysLeft <= 2 && <span className="pulse-dot"></span>}
          {daysLeft} days left
        </span>
      );
    }
    if (daysLeft <= 7) {
      return (
        <span className="trash-badge-days-inner trash-badge-days-warning">
          {daysLeft} days left
        </span>
      );
    }
    return (
      <span className="trash-badge-days-inner trash-badge-days-normal">
        {daysLeft} days left
      </span>
    );
  };

  if (collection.loading && items.length === 0) {
    return <div className="muted-center">Loading trash...</div>;
  }

  return (
    <div className="trash-container">
      {items.length === 0 ? (
        <div className="full-page-center" style={{ flexDirection: 'column', gap: 16 }}>
          <Trash2 size={48} color="#9aa0a6" />
          <h2 style={{ fontSize: 20, fontWeight: 500 }}>Trash is empty</h2>
          <p style={{ color: '#5f6368' }}>Items you move to trash will appear here.</p>
        </div>
      ) : (
        <div style={{ maxWidth: 800, margin: '0 auto', width: '100%', paddingBottom: 100 }}>
          
          {/* Top Banner */}
          <div className="trash-banner">
            <div className="trash-banner-header">
              <div className="trash-banner-icon">
                <Trash2 size={24} />
              </div>
              <div style={{ flex: 1 }}>
                <h2 className="trash-banner-title">30-day auto cleanup</h2>
                <div className="trash-banner-stats-text" style={{ marginTop: 4 }}>
                  <span style={{ color: 'var(--trash-outline)' }}>{items.length} items • {totalSizeMB} MB</span>
                </div>
              </div>
            </div>
            <p className="trash-banner-desc">
              Items are permanently deleted after 30 days in Trash. Cloud backup space is freed when permanently removed.
            </p>
            <div className="trash-banner-actions">
              {!isSelectMode ? (
                <>
                  <button className="trash-btn trash-btn-empty" onClick={handleEmptyTrash}>
                    <Trash2 size={16} />
                    Empty Trash
                  </button>
                  <button className="trash-btn trash-btn-restore-all" onClick={handleRestoreAll}>
                    <RotateCcw size={16} />
                    Restore All
                  </button>
                  <button className="trash-btn trash-btn-select" onClick={handleToggleSelectMode}>
                    <Check size={16} />
                    Select
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="trash-btn trash-btn-select-all"
                    onClick={() => {
                      if (selected.size === filteredItems.length) {
                        setSelected(new Set());
                      } else {
                        setSelected(new Set(filteredItems.map(m => m.id)));
                      }
                    }}
                  >
                    <Check size={16} />
                    {selected.size === filteredItems.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button className="trash-btn trash-btn-cancel" onClick={clearSelection}>
                    <X size={16} />
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="trash-filters">
            <button 
              className={`trash-filter-chip ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              <Grid3X3 size={16} />
              All Deleted
              <span className="trash-filter-count">{items.length}</span>
            </button>
            <button 
              className={`trash-filter-chip ${filter === 'photos' ? 'active' : ''}`}
              onClick={() => setFilter('photos')}
            >
              <Images size={16} />
              Photos
              <span className="trash-filter-count">{photoCount}</span>
            </button>
            <button 
              className={`trash-filter-chip ${filter === 'videos' ? 'active' : ''}`}
              onClick={() => setFilter('videos')}
            >
              <Video size={16} />
              Videos
              <span className="trash-filter-count">{videoCount}</span>
            </button>
          </div>

          {/* Sections */}
          {expiringSoon.length > 0 && (
            <div className="trash-section">
              <div className="trash-section-header">
                <div className="trash-section-title">
                  <Info size={20} className="trash-urgent-icon" />
                  Expiring soon
                </div>
                <span className="trash-section-badge">Action needed</span>
              </div>
              <div className="trash-grid">
                {expiringSoon.map((item) => {
                  const isSelected = selected.has(item.id);
                  return (
                    <div 
                      key={item.id} 
                      className={`trash-card ${isSelectMode ? 'trash-card-is-selecting' : ''} ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => toggleSelection(item.id)}
                    >
                      <img src={item.thumbnail_url} alt={item.filename} />
                      <div className="trash-card-overlay" />
                      
                      <div className="trash-badge-delete-icon">
                        <Trash2 size={12} />
                      </div>
                      
                      {item.media_type === 'video' && item.duration != null && (
                        <div className="trash-badge-video">
                          <Play size={10} fill="white" />
                          {formatDuration(item.duration)}
                        </div>
                      )}
                      
                      <div className="trash-badge-days">
                        {renderBadge(item.daysLeft)}
                      </div>
                      
                      <div className="trash-select-check">
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {earlier.length > 0 && (
            <div className="trash-section">
              <div className="trash-section-header">
                <div className="trash-section-title">Earlier this month</div>
                <span className="trash-section-count">{earlier.length} items</span>
              </div>
              <div className="trash-grid">
                {earlier.map((item) => {
                  const isSelected = selected.has(item.id);
                  return (
                    <div 
                      key={item.id} 
                      className={`trash-card ${isSelectMode ? 'trash-card-is-selecting' : ''} ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => toggleSelection(item.id)}
                    >
                      <img src={item.thumbnail_url} alt={item.filename} />
                      <div className="trash-card-overlay" />
                      
                      <div className="trash-badge-delete-icon">
                        <Trash2 size={12} />
                      </div>
                      
                      {item.media_type === 'video' && item.duration != null && (
                        <div className="trash-badge-video">
                          <Play size={10} fill="white" />
                          {formatDuration(item.duration)}
                        </div>
                      )}
                      
                      <div className="trash-badge-days">
                        {renderBadge(item.daysLeft)}
                      </div>
                      
                      <div className="trash-select-check">
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="trash-footer-banner">
            <Shield size={20} className="trash-footer-icon" />
            <p className="trash-footer-text">
              Items in Trash do not appear in your shared albums, memories, or search results until restored.
            </p>
          </div>
          
          {/* Floating Action Bar - Only appears when items are selected */}
          {selected.size > 0 && (
            <div className="trash-fab-container">
              <div className="trash-fab">
                <span className="trash-fab-count">{selected.size} selected</span>
                <button className="trash-fab-btn trash-fab-restore" onClick={handleRestore}>
                  <RotateCcw size={18} />
                  Restore
                </button>
                <button className="trash-fab-btn trash-fab-delete" onClick={handleDeleteForever}>
                  <Trash2 size={18} />
                  Delete Forever
                </button>
                <button
                  className="trash-fab-btn trash-fab-cancel"
                  onClick={clearSelection}
                  title="Cancel selection"
                  aria-label="Cancel selection"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          )}
          
        </div>
      )}
    </div>
  );
};

export default TrashGrid;
