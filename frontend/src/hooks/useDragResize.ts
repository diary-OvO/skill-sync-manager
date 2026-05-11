import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Persist to localStorage with graceful fallback; returns [value, setter].
function useStoredState<T>(key: string, initial: T, parse: (raw: string) => T | null) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initial;
      const parsed = parse(raw);
      return parsed ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / private-mode */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

// --- Vertical split (two stacked panels, drag handle in between) ---

export interface VerticalSplitState {
  /** Height in px of the top panel. */
  topHeight: number;
  /** Ref attached to the container whose height we measure. */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Mouse-down handler for the split handle. */
  onHandleMouseDown: (e: React.MouseEvent) => void;
  /** Whether the user is currently dragging. */
  dragging: boolean;
}

export interface HorizontalSplitState {
  /** Width in px of the left panel. */
  leftWidth: number;
  containerRef: React.RefObject<HTMLDivElement>;
  onHandleMouseDown: (e: React.MouseEvent) => void;
  dragging: boolean;
}

// Shared kernel: tracks "size of the first pane" along an axis, pinned to
// [minFirst, containerSize - minSecond]. `axis` picks which dimension to
// measure; everything else is the same between vertical and horizontal splits.
function useAxialSplit(
  axis: "vertical" | "horizontal",
  storageKey: string,
  options: { defaultFirst: number; minFirst: number; minSecond: number },
) {
  const { defaultFirst, minFirst, minSecond } = options;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [firstSize, setFirstSize] = useStoredState<number>(
    storageKey,
    defaultFirst,
    (raw) => {
      const n = Number(JSON.parse(raw));
      return Number.isFinite(n) ? n : null;
    },
  );
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(0);
  const dragStartFirst = useRef(0);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStart.current = axis === "vertical" ? e.clientY : e.clientX;
      dragStartFirst.current = firstSize;
      setDragging(true);
    },
    [axis, firstSize],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pointer = axis === "vertical" ? e.clientY : e.clientX;
      const span = axis === "vertical" ? rect.height : rect.width;
      const delta = pointer - dragStart.current;
      let next = dragStartFirst.current + delta;
      const max = Math.max(minFirst, span - minSecond);
      if (next < minFirst) next = minFirst;
      if (next > max) next = max;
      setFirstSize(next);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    // Prevent text selection + swap the cursor globally so it doesn't flicker
    // when the pointer leaves the handle during a fast drag.
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = axis === "vertical" ? "row-resize" : "col-resize";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [axis, dragging, minFirst, minSecond, setFirstSize]);

  // Re-clamp `firstSize` whenever the container shrinks below a size that
  // could still accommodate [minFirst, span - minSecond]. Without this, a
  // leftWidth of 560 persisted from a wide window would push the right pane
  // off-screen on a narrow window. Also runs once on mount in case the stored
  // value is stale relative to the current viewport.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const clampTo = (span: number) => {
      if (span <= 0) return;
      const max = Math.max(minFirst, span - minSecond);
      setFirstSize((prev) => {
        if (prev > max) return max;
        if (prev < minFirst) return minFirst;
        return prev;
      });
    };
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const span = axis === "vertical" ? entry.contentRect.height : entry.contentRect.width;
        clampTo(span);
      }
    });
    ro.observe(container);
    // Initial clamp using whatever size the container has right now.
    const rect = container.getBoundingClientRect();
    clampTo(axis === "vertical" ? rect.height : rect.width);
    return () => ro.disconnect();
  }, [axis, minFirst, minSecond, setFirstSize]);

  return { firstSize, containerRef, onHandleMouseDown, dragging };
}

export function useVerticalSplit(
  storageKey: string,
  options: { defaultTop: number; minTop: number; minBottom: number },
): VerticalSplitState {
  const s = useAxialSplit("vertical", storageKey, {
    defaultFirst: options.defaultTop,
    minFirst: options.minTop,
    minSecond: options.minBottom,
  });
  return {
    topHeight: s.firstSize,
    containerRef: s.containerRef,
    onHandleMouseDown: s.onHandleMouseDown,
    dragging: s.dragging,
  };
}

export function useHorizontalSplit(
  storageKey: string,
  options: { defaultLeft: number; minLeft: number; minRight: number },
): HorizontalSplitState {
  const s = useAxialSplit("horizontal", storageKey, {
    defaultFirst: options.defaultLeft,
    minFirst: options.minLeft,
    minSecond: options.minRight,
  });
  return {
    leftWidth: s.firstSize,
    containerRef: s.containerRef,
    onHandleMouseDown: s.onHandleMouseDown,
    dragging: s.dragging,
  };
}

// --- Column resize (per-column px widths, drag handle on each th) ---

export type ColumnWidths = Record<string, number>;

export interface ColumnResizeState {
  widths: ColumnWidths;
  reset: () => void;
  /** Returns a mouse-down handler bound to `columnKey`. */
  startResize: (columnKey: string) => (e: React.MouseEvent) => void;
  dragging: string | null;
}

export function useColumnResize(
  storageKey: string,
  defaults: ColumnWidths,
  minWidth = 60,
): ColumnResizeState {
  const defaultsKey = useMemo(() => JSON.stringify(defaults), [defaults]);
  const [widths, setWidths] = useStoredState<ColumnWidths>(
    storageKey,
    defaults,
    (raw) => {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const merged: ColumnWidths = { ...defaults };
        for (const [k, v] of Object.entries(parsed)) {
          if (k in defaults && typeof v === "number" && Number.isFinite(v)) {
            merged[k] = Math.max(minWidth, v);
          }
        }
        return merged;
      } catch {
        return null;
      }
    },
  );

  // If `defaults` gains new keys (new column added), merge them in.
  useEffect(() => {
    setWidths((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, v] of Object.entries(defaults)) {
        if (!(k in next)) {
          next[k] = v;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [defaultsKey, defaults, setWidths]);

  const [dragging, setDragging] = useState<string | null>(null);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  const startResize = useCallback(
    (columnKey: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragStartX.current = e.clientX;
      dragStartW.current = widths[columnKey] ?? defaults[columnKey] ?? 100;
      setDragging(columnKey);
    },
    [widths, defaults],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartX.current;
      const next = Math.max(minWidth, dragStartW.current + delta);
      setWidths((prev) => ({ ...prev, [dragging]: next }));
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [dragging, minWidth, setWidths]);

  const reset = useCallback(() => setWidths(defaults), [defaults, setWidths]);

  return { widths, reset, startResize, dragging };
}
