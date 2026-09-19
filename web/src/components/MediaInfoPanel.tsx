import { Calendar, Clock, Edit2, FileImage, FileVideoCamera, HardDrive, Maximize, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Media } from '../types/media';
import { formatBytes, formatDateTime, formatDuration } from '../utils/dateUtils';
import { showToast } from '../utils/toast';

const Row = ({ icon, primary, secondary, action }: { icon: ReactNode; primary: ReactNode; secondary?: ReactNode; action?: ReactNode }) => (
  <div className="info-row">
    <div className="info-icon">{icon}</div>
    <div className="info-content">
      <div>
        <div className="info-primary">{primary}</div>
        {secondary && <div className="info-secondary">{secondary}</div>}
      </div>
      {action && <div className="info-action">{action}</div>}
    </div>
  </div>
);

const MediaInfoPanel = ({ item, onClose, onUpdateTakenAt }: { item: Media; onClose: () => void; onUpdateTakenAt?: (id: number, date: Date) => void }) => {
  const megapixels = item.width && item.height ? ((item.width * item.height) / 1_000_000).toFixed(1) : null;

  const handleEditDate = () => {
    if (!onUpdateTakenAt) return;
    const currentStr = formatDateTime(item.taken_at || item.created_at);
    const dateStr = window.prompt(`Edit date/time (YYYY-MM-DD HH:MM):`, currentStr);
    if (!dateStr) return;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      showToast('Invalid date format', 'error');
      return;
    }
    onUpdateTakenAt(item.id, date);
  };

  return (
    <aside className="viewer-info" aria-label="Details">
      <header className="viewer-info-header">
        <h2>Info</h2>
        <button className="btn-icon" onClick={onClose} aria-label="Close info">
          <X size={20} />
        </button>
      </header>
      <div className="viewer-info-body">
        <div className="info-section-title">Details</div>
        <Row
          icon={<Calendar size={20} />}
          primary={formatDateTime(item.taken_at || item.created_at)}
          secondary="Date taken"
          action={
            onUpdateTakenAt && (
              <button className="btn-icon btn-small" onClick={handleEditDate} title="Edit date">
                <Edit2 size={16} />
              </button>
            )
          }
        />
        <Row
          icon={item.media_type === 'video' ? <FileVideoCamera size={20} /> : <FileImage size={20} />}
          primary={<span className="break-all">{item.filename}</span>}
          secondary={item.mime_type}
        />
        <Row icon={<HardDrive size={20} />} primary={formatBytes(item.file_size)} secondary="File size" />
        {item.width && item.height ? (
          <Row
            icon={<Maximize size={20} />}
            primary={`${item.width} × ${item.height}`}
            secondary={megapixels ? `${megapixels} MP` : undefined}
          />
        ) : null}
        {item.media_type === 'video' && item.duration ? (
          <Row icon={<Clock size={20} />} primary={formatDuration(item.duration)} secondary="Duration" />
        ) : null}
        {item.status !== 'completed' && (
          <div className={`info-status status-${item.status}`}>
            {item.status === 'processing' ? 'Still processing…' : item.upload_error || `Status: ${item.status}`}
          </div>
        )}
        <div className="info-meta">Uploaded {formatDateTime(item.created_at)}</div>
      </div>
    </aside>
  );
};

export default MediaInfoPanel;
