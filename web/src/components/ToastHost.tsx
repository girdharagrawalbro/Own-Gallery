import { useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { dismissToast, toastStore } from '../utils/toast';

const ToastHost = () => {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span>{t.message}</span>
          <button className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastHost;
