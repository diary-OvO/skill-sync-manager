import { useCallback, useEffect, useState } from "react";

// localStorage 键：bump 后缀以避免未来字段变更时读到旧结构。
const STORAGE_KEY = "ssm.inspector.ignored.v1";

function readStore(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return new Set(arr.filter((x): x is string => typeof x === "string"));
    }
  } catch {
    /* 读/解析失败就退回空集合，忽略清单仅为可用性增强，不是安全边界。 */
  }
  return new Set();
}

function writeStore(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* 配额满或私密模式写失败：下次会话再尝试，当前 session 仍然有效。 */
  }
}

export interface IgnoredPaths {
  ignored: Set<string>;
  isIgnored: (path: string) => boolean;
  ignore: (path: string) => void;
  unignore: (path: string) => void;
  clear: () => void;
}

// 前端侧的"永久忽略"清单。保存整路径（绝对路径即可保证跨扫描稳定）。
// 目前只供 ToolInspectorPanel 过滤 external 项使用，后续若需扩到其他视图，
// 只要复用同一个 key 即可。
export function useIgnoredPaths(): IgnoredPaths {
  const [ignored, setIgnored] = useState<Set<string>>(() => readStore());

  useEffect(() => {
    writeStore(ignored);
  }, [ignored]);

  const isIgnored = useCallback((path: string) => ignored.has(path), [ignored]);

  const ignore = useCallback((path: string) => {
    setIgnored((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  const unignore = useCallback((path: string) => {
    setIgnored((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setIgnored((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  return { ignored, isIgnored, ignore, unignore, clear };
}
