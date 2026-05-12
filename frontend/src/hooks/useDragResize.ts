import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// 将状态持久化到 localStorage，并在读写失败时优雅降级；返回 [value, setter]。
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
      /* 忽略配额、隐私模式等写入失败 */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

// 统一处理"全局鼠标拖拽"的副作用：在 enabled 为 true 期间监听
// mousemove / mouseup，并临时替换 body 的 cursor / userSelect，
// 在结束时恢复原值。useAxialSplit 与 useColumnResize 共用。
function useGlobalMouseDrag(
  enabled: boolean,
  cursor: string,
  handlers: { onMove: (e: MouseEvent) => void; onEnd: () => void },
) {
  const { onMove, onEnd } = handlers;
  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = cursor;
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [enabled, cursor, onMove, onEnd]);
}

// --- 上下分栏（两个纵向面板，中间有拖拽条） ---

export interface VerticalSplitState {
  /** 顶部面板的像素高度。 */
  topHeight: number;
  /** 绑定到容器的 ref，用来读取容器尺寸。 */
  containerRef: React.RefObject<HTMLDivElement>;
  /** 分栏拖拽条的 mousedown 处理器。 */
  onHandleMouseDown: (e: React.MouseEvent) => void;
  /** 用户是否正在拖拽。 */
  dragging: boolean;
}

export interface HorizontalSplitState {
  /** 左侧面板的像素宽度。 */
  leftWidth: number;
  containerRef: React.RefObject<HTMLDivElement>;
  onHandleMouseDown: (e: React.MouseEvent) => void;
  dragging: boolean;
}

// 共用内核：沿某个轴追踪"第一块面板的尺寸"，并约束在
// [minFirst, containerSize - minSecond] 区间内。axis 决定度量的维度，
// 垂直 / 水平分栏的其余逻辑完全一致。
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

  const onMove = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pointer = axis === "vertical" ? e.clientY : e.clientX;
      const span = axis === "vertical" ? rect.height : rect.width;
      const delta = pointer - dragStart.current;
      const max = Math.max(minFirst, span - minSecond);
      let next = dragStartFirst.current + delta;
      if (next < minFirst) next = minFirst;
      if (next > max) next = max;
      setFirstSize(next);
    },
    [axis, minFirst, minSecond, setFirstSize],
  );
  const onEnd = useCallback(() => setDragging(false), []);
  // 禁用文本选择 + 全局替换光标，避免快速拖拽时指针离开拖拽条造成光标闪烁。
  useGlobalMouseDrag(dragging, axis === "vertical" ? "row-resize" : "col-resize", {
    onMove,
    onEnd,
  });

  // 当容器缩小到 [minFirst, span - minSecond] 已经容纳不下时，重新对 firstSize 做 clamp。
  // 否则在宽窗口下存的 leftWidth=560 会在窄窗口里把右侧面板推出视口。
  // 同时在挂载时运行一次，用来修正与当前视口不匹配的历史存储值。
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
    // 使用容器当前的实际尺寸做一次初始 clamp。
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

// --- 表格列宽拖拽（每列独立像素宽度，表头上各有一个拖拽条） ---

export type ColumnWidths = Record<string, number>;

export interface ColumnResizeState {
  widths: ColumnWidths;
  reset: () => void;
  /** 返回一个绑定到 columnKey 的 mousedown 处理器。 */
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

  // 当 defaults 新增了键（例如新加了一列），把它合并进现有的宽度 map。
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

  const onMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging) return;
      const delta = e.clientX - dragStartX.current;
      const next = Math.max(minWidth, dragStartW.current + delta);
      setWidths((prev) => ({ ...prev, [dragging]: next }));
    },
    [dragging, minWidth, setWidths],
  );
  const onEnd = useCallback(() => setDragging(null), []);
  useGlobalMouseDrag(dragging !== null, "col-resize", { onMove, onEnd });

  const reset = useCallback(() => setWidths(defaults), [defaults, setWidths]);

  return { widths, reset, startResize, dragging };
}
