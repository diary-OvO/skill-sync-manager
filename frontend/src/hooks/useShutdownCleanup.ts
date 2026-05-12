import { useEffect } from "react";

type CleanupFn = () => void;

/**
 * 注册一段"窗口即将消失"时要执行的清理逻辑：页面隐藏、卸载，或 Wails 主动关闭。
 * 用于那些必须在任何 React 卸载顺序之前完成的工作 ——
 * 如冲刷 localStorage 缓存、停止 setInterval、发送最后一条日志等。
 *
 * 约束：
 *  - 清理必须是同步且快速的。`pagehide` / `beforeunload` 只给几毫秒时间，
 *    异步任务会被切断。
 *  - 清理必须是幂等的。浏览器可能在极短时间内连续触发 `pagehide` 与 `beforeunload`，
 *    开发模式下 React StrictMode 也会让 hook 挂载两次。
 *  - 当注册它的组件卸载时（如路由切换），清理也会被触发一次。
 */
export function useShutdownCleanup(cleanup: CleanupFn): void {
  useEffect(() => {
    let ran = false;
    const runOnce = () => {
      if (ran) return;
      ran = true;
      try {
        cleanup();
      } catch {
        /* 吞掉异常：我们正在离开，已经没人接收报告 */
      }
    };

    // pagehide 在标签关闭、导航离开，以及多数平台上 Wails webview 被销毁时触发。
    // 它是所有"窗口即将消失"事件中最可靠的一个：
    // beforeunload 在移动端不触发，unload 已被弃用。
    window.addEventListener("pagehide", runOnce);
    // beforeunload 覆盖桌面端 pagehide 抵达过晚的场景，再给一次机会做同步清理。
    window.addEventListener("beforeunload", runOnce);

    return () => {
      window.removeEventListener("pagehide", runOnce);
      window.removeEventListener("beforeunload", runOnce);
      runOnce();
    };
  }, [cleanup]);
}
