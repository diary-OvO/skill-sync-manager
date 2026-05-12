import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

export type ToastKind = "info" | "success" | "error";

export interface ToastAction {
  label: string;
  onPerform: () => void;
}

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
  /** 毫秒；undefined = 不自动消失 */
  timeout?: number;
}

export interface ToastApi {
  push: (toast: Omit<ToastItem, "id">) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_TIMEOUT = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback<ToastApi["push"]>(
    (toast) => {
      const id = nextId.current++;
      const full: ToastItem = { ...toast, id };
      setItems((prev) => [...prev, full]);
      const timeout = toast.timeout ?? DEFAULT_TIMEOUT;
      if (timeout > 0) {
        const handle = window.setTimeout(() => dismiss(id), timeout);
        timers.current.set(id, handle);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((h) => window.clearTimeout(h));
      timers.current.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-layer" role="region" aria-label="Notifications">
        <ul className="toast-stack" aria-live="polite" aria-atomic="false">
          {items.map((t) => (
            <li key={t.id} className={`toast toast--${t.kind}`}>
              <span className="toast-msg">{t.message}</span>
              {t.action ? (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    t.action?.onPerform();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              ) : null}
              <button
                type="button"
                className="toast-close"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
