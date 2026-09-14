import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { api, getErrorMessage } from '../api/client';
import Modal from './Modal';

interface ShareLinkModalProps {
  mediaId: number;
  onClose: () => void;
}

const ShareLinkModal = ({ mediaId, onClose }: ShareLinkModalProps) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .share(mediaId)
      .then((link) => {
        if (!cancelled) setUrl(link);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not create a share link'));
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed — select the link and copy it manually.');
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="share-title">
      <div className="modal-header">
        <h2 id="share-title">Share link</h2>
        <button className="btn-icon" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">
        <p className="muted">Anyone with this link can view this item.</p>
        {error && <div className="form-error">{error}</div>}
        <div className="share-row">
          <input
            className="input-field"
            value={url ?? 'Creating link…'}
            readOnly
            onFocus={(e) => e.target.select()}
            aria-label="Share link"
          />
          <button className="btn-primary sm" onClick={copy} disabled={!url}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ShareLinkModal;
