import { useEffect } from "react";

type CleanupFn = () => void;

/**
 * Register a cleanup function that runs when the window is about to go away:
 * page hide, unload, or Wails-side shutdown. Use this for things that must
 * happen regardless of React unmount order — flushing a pending localStorage
 * write, stopping a `setInterval`, sending a final log event, etc.
 *
 * Contract:
 *  - The cleanup must be synchronous and fast. `pagehide`/`beforeunload`
 *    listeners are given a few ms at best; async work will be cut off.
 *  - The cleanup must be idempotent. The browser may fire `pagehide` followed
 *    by `beforeunload` in quick succession, and React StrictMode in dev will
 *    mount the hook twice.
 *  - The cleanup also runs when the component that registered it unmounts,
 *    so routing away from a view triggers it too.
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
        /* swallow — we are on the way out, nothing to report to */
      }
    };

    // pagehide fires on tab close, navigation away, and (on most platforms)
    // when the Wails webview is torn down. It is the most reliable of the
    // "window is going away" events; beforeunload is not fired on mobile and
    // unload is deprecated.
    window.addEventListener("pagehide", runOnce);
    // beforeunload covers the desktop case where pagehide arrives too late,
    // and gives us one more shot at synchronous cleanup.
    window.addEventListener("beforeunload", runOnce);

    return () => {
      window.removeEventListener("pagehide", runOnce);
      window.removeEventListener("beforeunload", runOnce);
      runOnce();
    };
  }, [cleanup]);
}
