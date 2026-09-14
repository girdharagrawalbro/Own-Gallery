import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  width?: number;
}

/** Light dialog on a dimmed backdrop. Closes on Escape or backdrop click. */
const Modal = ({ onClose, children, labelledBy, width = 420 }: ModalProps) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // Capture phase so the viewer underneath doesn't also close.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} style={{ maxWidth: width }}>
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
