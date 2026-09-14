import { memo, useState } from 'react';
import { ChevronDown, ChevronUp, CircleCheck, Film, Image as ImageIcon, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { useUploadActions, useUploadState } from '../context/uploads';
import { isTerminal } from '../utils/uploadManager';
import type { UploadItem } from '../utils/uploadManager';
import { formatBytes } from '../utils/dateUtils';
import MediaImage from './MediaImage';

function statusText(item: UploadItem): string {
  switch (item.status) {
    case 'queued':
      return 'Waiting…';
    case 'uploading': {
      const pct = item.size > 0 ? Math.floor((item.bytesUploaded / item.size) * 100) : 0;
      return `${pct}% · ${formatBytes(item.bytesUploaded)} of ${formatBytes(item.size)}`;
    }
    case 'processing':
      return 'Processing…';
    case 'completed':
      return 'Uploaded';
    case 'duplicate':
      return 'Already in your library';
    case 'failed':
      return item.error || 'Upload failed';
    case 'cancelled':
      return 'Cancelled';
  }
}

const UploadRow = memo(({ item, onCancel, onRetry }: { item: UploadItem; onCancel: (id: string) => void; onRetry: (id: string) => void }) => {
  const progress =
    item.status === 'uploading' && item.size > 0
      ? item.bytesUploaded / item.size
      : item.status === 'processing' || item.status === 'completed' || item.status === 'duplicate'
        ? 1
        : 0;
  const canCancel = item.status === 'queued' || item.status === 'uploading';
  const canRetry = (item.status === 'failed' || item.status === 'cancelled') && item.kind !== null;

  return (
    <li className={`upload-row status-${item.status}`}>
      <div className="upload-thumb">
        {item.thumbUrl ? (
          <MediaImage src={item.thumbUrl} alt="" />
        ) : item.kind === 'video' ? (
          <Film size={18} />
        ) : (
          <ImageIcon size={18} />
        )}
      </div>
      <div className="upload-body">
        <div className="upload-name" title={item.name}>
          {item.name}
        </div>
        <div className="upload-status">{statusText(item)}</div>
        {!isTerminal(item.status) && (
          <div className={`upload-progress ${item.status === 'processing' || item.status === 'queued' ? 'indeterminate' : ''}`}>
            <div style={{ transform: `scaleX(${progress})` }} />
          </div>
        )}
      </div>
      <div className="upload-actions">
        {item.status === 'completed' && <CircleCheck size={20} className="upload-ok" />}
        {item.status === 'duplicate' && <CircleCheck size={20} className="upload-dup" />}
        {item.status === 'failed' && !canRetry && <TriangleAlert size={18} className="upload-err" />}
        {canRetry && (
          <button className="btn-icon sm" onClick={() => onRetry(item.id)} title="Retry" aria-label={`Retry ${item.name}`}>
            <RotateCcw size={16} />
          </button>
        )}
        {canCancel && (
          <button className="btn-icon sm" onClick={() => onCancel(item.id)} title="Cancel" aria-label={`Cancel ${item.name}`}>
            <X size={16} />
          </button>
        )}
      </div>
    </li>
  );
});

/** Google-Photos-like floating upload panel (bottom right). */
const UploadPanel = () => {
  const { items } = useUploadState();
  const { cancel, retry, clearFinished, cancelAll } = useUploadActions();
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return null;

  const total = items.length;
  let finished = 0;
  let succeeded = 0;
  let failed = 0;
  let bytesTotal = 0;
  let bytesDone = 0;
  for (const item of items) {
    if (isTerminal(item.status)) finished++;
    if (item.status === 'completed' || item.status === 'duplicate') succeeded++;
    if (item.status === 'failed') failed++;
    if (item.status !== 'cancelled' && item.kind) {
      bytesTotal += item.size;
      bytesDone += item.status === 'queued' || item.status === 'failed' ? 0 : item.status === 'uploading' ? item.bytesUploaded : item.size;
    }
  }
  const allDone = finished === total;
  const title = allDone
    ? `${succeeded} upload${succeeded === 1 ? '' : 's'} complete${failed ? ` · ${failed} failed` : ''}`
    : `Uploading ${Math.min(finished + 1, total)} of ${total} item${total === 1 ? '' : 's'}`;
  const overall = bytesTotal > 0 ? bytesDone / bytesTotal : 0;

  return (
    <section className={`upload-panel ${collapsed ? 'collapsed' : ''}`} aria-label="Uploads">
      <header className="upload-panel-header">
        <span className="upload-panel-title" aria-live="polite">
          {title}
        </span>
        {!allDone && !collapsed && (
          <button className="text-btn" onClick={cancelAll}>
            Cancel all
          </button>
        )}
        <button
          className="btn-icon sm"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {allDone && (
          <button className="btn-icon sm" onClick={clearFinished} title="Close" aria-label="Close uploads panel">
            <X size={18} />
          </button>
        )}
      </header>
      {!allDone && (
        <div className="upload-overall">
          <div style={{ transform: `scaleX(${overall})` }} />
        </div>
      )}
      {!collapsed && (
        <ul className="upload-list">
          {items.map((item) => (
            <UploadRow key={item.id} item={item} onCancel={cancel} onRetry={retry} />
          ))}
        </ul>
      )}
    </section>
  );
};

export default UploadPanel;
