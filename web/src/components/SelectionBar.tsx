import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SelectionBarProps {
  count: number;
  onClear: () => void;
  children: ReactNode;
}

/** Google-Photos-like top bar that replaces the app bar while items are selected. */
const SelectionBar = ({ count, onClear, children }: SelectionBarProps) => {
  useEffect(() => {
    if (count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      // The viewer handles Escape itself while it is open.
      if (e.key === 'Escape' && !document.body.classList.contains('viewer-open')) onClear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, onClear]);

  if (count === 0) return null;

  return createPortal(
    <div className="selection-bar" role="toolbar" aria-label="Selection actions">
      <button className="btn-icon" onClick={onClear} title="Clear selection" aria-label="Clear selection">
        <X size={22} />
      </button>
      <span className="selection-count">{count} selected</span>
      <div className="selection-actions">{children}</div>
    </div>,
    document.body,
  );
};

interface SelectionActionProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export const SelectionAction = ({ icon, label, onClick, danger, disabled }: SelectionActionProps) => (
  <button
    className={`btn-icon${danger ? ' danger' : ''}`}
    onClick={onClick}
    title={label}
    aria-label={label}
    disabled={disabled}
  >
    {icon}
  </button>
);

export default SelectionBar;
