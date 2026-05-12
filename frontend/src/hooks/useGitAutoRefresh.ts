import { useCallback, useEffect, useRef } from "react";
import { wailsApi as api } from "../lib/wailsApi";
import type { GitStatus, LogEntry } from "../types";

type LogLocal = (action: string, result: LogEntry["result"], message: string) => void;

interface Options {
  sharedRoot: string;
  setGitStatus: (status: GitStatus) => void;
  logLocal: LogLocal;
  // 单位毫秒；默认 30s，留出接口方便后续做成可配置。
  intervalMs?: number;
}

// useGitAutoRefresh 建立 Git 状态的三条刷新路径：
//
//   1) 定时轮询：每 intervalMs 拉一次，作为兜底，覆盖所有外部改动
//      （用户在 VS Code / 命令行完成的 commit、切分支、stash 等）。
//   2) 窗口重获焦点：只要 tab / 窗口从隐藏变可见，立刻拉一次，避免
//      用户切回来看到过时状态，也能让"我刚在外面切了分支"这种场景
//      在第一帧就对上号。
//   3) 主动刷新：暴露 refreshNow 给组件在 sync / unlink / import
//      等改动文件系统的操作完成后显式调用，比等到下一轮轮询更及时。
//
// 并发保护：
//   - inflightRef 避免两次刷新叠加（例如：轮询刚开始，用户又切回
//     前台触发 visibilitychange）。后到者直接 return，不排队、不重试。
//   - sharedRoot 变更时用 latestRootRef 判断回调是否过期，防止切换
//     根目录后旧请求回来把状态写错。
//
// 错误处理：
//   - 仅写本地日志，不弹 toast —— 30s 一次的静默背景任务不应打扰用户。
export function useGitAutoRefresh({
  sharedRoot,
  setGitStatus,
  logLocal,
  intervalMs = 30_000,
}: Options): { refreshNow: () => Promise<void> } {
  const inflightRef = useRef(false);
  const latestRootRef = useRef(sharedRoot);
  // 用 ref 固化最新的回调引用。组件每次渲染都会新建一个 logLocal /
  // setGitStatus 闭包，如果让 refreshNow 把它们当依赖，interval
  // 就会每个 render 重新 clear/setInterval，行为接近"每次 render
  // 都重置计时"，与 30s 语义冲突。
  const setGitStatusRef = useRef(setGitStatus);
  const logLocalRef = useRef(logLocal);

  useEffect(() => {
    latestRootRef.current = sharedRoot;
  }, [sharedRoot]);
  useEffect(() => {
    setGitStatusRef.current = setGitStatus;
  }, [setGitStatus]);
  useEffect(() => {
    logLocalRef.current = logLocal;
  }, [logLocal]);

  const refreshNow = useCallback(async (): Promise<void> => {
    const root = latestRootRef.current;
    if (!root || inflightRef.current) return;
    inflightRef.current = true;
    try {
      const status = await api.getGitStatus(root);
      // 响应回到时如果 root 已经被换掉，就不能写回旧的 git 状态。
      if (latestRootRef.current !== root) return;
      setGitStatusRef.current(status);
    } catch (err) {
      logLocalRef.current("git.refresh", "error", (err as Error).message);
    } finally {
      inflightRef.current = false;
    }
  }, []);

  // 定时轮询：sharedRoot 变化（或为空）时重建，清空期间不跑。
  useEffect(() => {
    if (!sharedRoot) return;
    const handle = window.setInterval(() => {
      void refreshNow();
    }, intervalMs);
    return () => window.clearInterval(handle);
  }, [sharedRoot, intervalMs, refreshNow]);

  // 窗口重获焦点：document.visibilityState 从 hidden → visible 触发。
  // 这个事件也会在 Wails 窗口从托盘恢复时触发，实测可靠。
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        void refreshNow();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshNow]);

  return { refreshNow };
}
