export type ToastKind = 'info' | 'error';

export interface ToastMessage {
  id: number;
  message: string;
  kind: ToastKind;
}

const DURATION_MS = 4000;

let toasts: ToastMessage[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function showToast(message: string, kind: ToastKind = 'info') {
  const toast = { id: nextId++, message, kind };
  toasts = [...toasts.slice(-2), toast];
  emit();
  window.setTimeout(() => dismissToast(toast.id), DURATION_MS);
}

export function dismissToast(id: number) {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emit();
  }
}

export const toastStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => toasts,
};
