import { useCallback, useEffect, useRef, useState } from "react";
import { wailsApi as api } from "./lib/wailsApi";
import type {
  CliSkillEntry,
  GitStatus,
  LogEntry,
  SkillInfo,
  SkillOrigin,
  SupportedTool,
  SyncStatus,
  ToolName,
  ToolStatus,
} from "./types";
import { RootSelector } from "./components/RootSelector";
import { GitStatusPanel } from "./components/GitStatusPanel";
import { ToolStatusPanel } from "./components/ToolStatusPanel";
import { SkillTable } from "./components/SkillTable";
import { SkillDetail } from "./components/SkillDetail";
import { GlobalSyncBar } from "./components/GlobalSyncBar";
import { LogPanel } from "./components/LogPanel";
import { ToolInspectorPanel } from "./components/ToolInspectorPanel";
import { ToastProvider, useToast } from "./components/Toast";
import { ScanProgressOverlay } from "./components/ScanProgressOverlay";
import { useVerticalSplit } from "./hooks/useDragResize";
import { useShutdownCleanup } from "./hooks/useShutdownCleanup";
import { useSyncActions, type SyncStatusMap } from "./hooks/useSyncActions";
import { useIgnoredPaths } from "./hooks/useIgnoredPaths";
import { useGitAutoRefresh } from "./hooks/useGitAutoRefresh";
import { useLanguage } from "./i18n";

// 向后兼容：历史上 SyncStatusMap 在 App.tsx 导出，现在搬到 hooks 里，保留 re-export。
export type { SyncStatusMap } from "./hooks/useSyncActions";

type InspectorState = {
  claude: CliSkillEntry[];
  codex: CliSkillEntry[];
};

function isWindowsPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const hint = nav.userAgentData?.platform ?? "";
  if (hint) return hint.toLowerCase().includes("win");
  return navigator.userAgent.toLowerCase().includes("windows");
}

export function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const { t } = useLanguage();
  const toast = useToast();
  const ignoredPaths = useIgnoredPaths();

  const [sharedRoot, setSharedRoot] = useState<string>("");
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkillPath, setSelectedSkillPath] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatusMap>({});
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [platformWarning, setPlatformWarning] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [inspector, setInspector] = useState<InspectorState>({ claude: [], codex: [] });
  const [inspectorBusy, setInspectorBusy] = useState<Record<SupportedTool, boolean>>({
    claude: false,
    codex: false,
  });
  const didInit = useRef(false);
  // 保存 Wails "log:entry" 的取消订阅函数，关闭时优先用它来清理。
  // React 卸载清理在 pagehide / 窗口关闭时可能来不及触发，因此这里用 ref 兜底。
  const logUnsubRef = useRef<(() => void) | null>(null);
  // 扫描 token：每次 runScanFlow 开启时 +1；用户按取消或开启新扫描都会
  // 让旧 token 不再匹配，回调 setXxx 被全部丢弃，避免"取消后旧结果覆盖"。
  const scanTokenRef = useRef(0);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    (async () => {
      if (!isWindowsPlatform()) {
        setPlatformWarning(true);
      }
      try {
        const history = await api.logHistory();
        setLogs(history);
      } catch {
        /* 历史日志尚不可用 */
      }
      try {
        const settings = await api.loadSettings();
        if (settings.sharedRoot) {
          setSharedRoot(settings.sharedRoot);
          await runScanFlow(settings.sharedRoot);
        } else {
          const toolList = await api.detectCliTools();
          setTools(toolList);
        }
      } catch (err) {
        logLocal("startup", "error", (err as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 日志订阅独立成 effect：不能与 didInit 守卫的启动流程共用，否则
  // React 18 StrictMode 的 mount → cleanup → mount 二次执行里，
  // cleanup 会取消首个订阅，二次 mount 因为 didInit 守卫立即 return，
  // 订阅不会重建，后端推过来的日志就全部丢失 —— 这正是 Log 面板看起来"不更新"的根因。
  useEffect(() => {
    const unsubscribe = api.onLog((entry) => {
      appendLog(entry);
    });
    logUnsubRef.current = unsubscribe;
    return () => {
      unsubscribe();
      logUnsubRef.current = null;
    };
  }, []);

  // 关闭时的同步幂等清理：pagehide / beforeunload / 组件卸载都会触发。
  // 任何需要跨关闭持久化的 UI 状态必须在这里返回之前提交。
  //
  // 目前唯一活跃的订阅是 Wails log-entry 监听；
  // 分栏尺寸已经在每次变化时即时持久化（见 useDragResize.ts）。
  // 未来若引入计时器、Web Worker、待取消的 fetch 等，都应加到此函数内。
  const onShutdown = useCallback(() => {
    try {
      logUnsubRef.current?.();
      logUnsubRef.current = null;
    } catch {
      /* 忽略：Wails runtime 此时可能已销毁 */
    }
  }, []);
  useShutdownCleanup(onShutdown);

  function appendLog(entry: LogEntry): void {
    setLogs((prev) => {
      const next = [...prev, entry];
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
  }

  // 构造并追加一条本地日志。统一处理 timestamp，避免调用处到处重复 `new Date().toISOString()`。
  const logLocal = useCallback(
    (action: string, result: LogEntry["result"], message: string): void => {
      appendLog({
        timestamp: new Date().toISOString(),
        action,
        result,
        message,
      });
    },
    [],
  );

  // 合并某个 skill × tool 的同步状态到全局 syncStatus。
  // useSyncActions 的 syncOne / bulkSync / refreshOne 都走这一个入口，
  // 避免手写嵌套 spread。
  function mergeSyncStatus(path: string, tool: ToolName, status: SyncStatus): void {
    setSyncStatus((prev) => ({
      ...prev,
      [path]: { ...(prev[path] ?? {}), [tool]: status },
    }));
  }

  // useSyncActions 里 unlinkOne 完成后要拿"权威态"回写 —— 调一次 CheckSyncStatus 并 merge。
  const refreshOne = useCallback(
    async (skill: SkillInfo, tool: ToolName): Promise<void> => {
      try {
        const status = await api.checkSyncStatus(skill, tool);
        mergeSyncStatus(skill.path, tool, status);
      } catch {
        /* 非致命：下次 Scan / RefreshSync 会重新拉 */
      }
    },
    [],
  );

  const actions = useSyncActions({ skills, syncStatus, mergeSyncStatus, refreshOne });

  // Git 状态三路同步：30s 定时 + 窗口聚焦 + 操作后主动调 refreshNow()。
  // 单次 GetGitStatus 需要 5 个 git CLI 调用（~250-1000ms），30s 频率
  // 对磁盘/CPU 压力可忽略；但聚焦触发能保证用户切回应用看到的就是最新态。
  const { refreshNow: refreshGitStatus } = useGitAutoRefresh({
    sharedRoot,
    setGitStatus,
    logLocal,
  });

  async function refreshSyncStatuses(list: SkillInfo[]): Promise<SyncStatusMap> {
    if (list.length === 0) return {};
    try {
      const batch = await api.refreshSyncStatuses(list);
      const map: SyncStatusMap = {};
      for (const [path, inner] of Object.entries(batch)) {
        map[path] = inner as Partial<Record<ToolName, SyncStatus>>;
      }
      return map;
    } catch {
      // 批量接口不可用时，退化为逐个 skill 调用。
      const map: SyncStatusMap = {};
      await Promise.all(
        list.map(async (skill) => {
          const [claude, codex] = await Promise.all([
            api.checkSyncStatus(skill, "claude"),
            api.checkSyncStatus(skill, "codex"),
          ]);
          map[skill.path] = { claude, codex };
        }),
      );
      return map;
    }
  }

  async function runScanFlow(root: string): Promise<void> {
    if (!root) return;
    const token = ++scanTokenRef.current;
    setBusy(true);
    try {
      // allSettled：三个 API 任何一个报错（无权限 / 路径不存在 / CLI 工具检测失败），
      // 都不应该让其他两个结果一起丢，也绝不能把整个 UI 卡死。
      const [scannedRes, gitRes, toolsRes] = await Promise.allSettled([
        api.scanSkills(root),
        api.getGitStatus(root),
        api.detectCliTools(),
      ]);

      // 用户在期间按了取消（token 被 bump）—— 直接丢弃结果。
      if (token !== scanTokenRef.current) return;

      if (scannedRes.status === "fulfilled") {
        setSkills(scannedRes.value);
        const scanned = scannedRes.value;
        const statuses = await refreshSyncStatuses(scanned);
        if (token !== scanTokenRef.current) return;
        setSyncStatus(statuses);
        if (scanned.length > 0 && !scanned.find((s) => s.path === selectedSkillPath)) {
          setSelectedSkillPath(scanned[0].path);
        }
      } else {
        const msg = (scannedRes.reason as Error)?.message ?? String(scannedRes.reason);
        logLocal("scan", "error", msg);
        toast.push({ kind: "error", message: t("scan.error", { message: msg }) });
      }

      if (gitRes.status === "fulfilled") {
        setGitStatus(gitRes.value);
      } else {
        logLocal("scan.git", "error", (gitRes.reason as Error)?.message ?? String(gitRes.reason));
      }

      if (toolsRes.status === "fulfilled") {
        setTools(toolsRes.value);
      } else {
        logLocal(
          "scan.tools",
          "error",
          (toolsRes.reason as Error)?.message ?? String(toolsRes.reason),
        );
      }
    } finally {
      // 无论成功、失败、还是已被取消（token 已不匹配），一定要把遮罩收回去。
      if (token === scanTokenRef.current) {
        setBusy(false);
      }
    }
  }

  // 取消当前扫描：只是关闭遮罩并丢弃飞行中结果。
  // Wails 不支持取消已经下发的 goroutine，因此后端仍会跑完，
  // 但前端从此刻起看不见它的 setState。
  const cancelScan = useCallback(() => {
    scanTokenRef.current += 1;
    setBusy(false);
    logLocal("scan.cancel", "info", "User cancelled the scan. Ongoing backend work will finish but its results will be discarded.");
  }, []);

  async function handleBrowseRoot(): Promise<void> {
    try {
      const picked = await api.selectRootFolder();
      if (!picked) return;
      setSharedRoot(picked);
      await api.saveSettings({ sharedRoot: picked });
      await runScanFlow(picked);
    } catch (err) {
      window.alert(t("action.browseFail", { message: (err as Error).message }));
    }
  }

  async function handleScan(): Promise<void> {
    if (!sharedRoot) return;
    try {
      await api.saveSettings({ sharedRoot });
    } catch {
      /* 非致命错误：settings 写失败不应该阻断扫描流程 */
    }
    await runScanFlow(sharedRoot);
  }

  async function handleRefreshSync(): Promise<void> {
    if (skills.length === 0) return;
    setBusy(true);
    try {
      const map = await refreshSyncStatuses(skills);
      setSyncStatus(map);
      logLocal("sync.refresh", "success", `Refreshed sync status for ${skills.length} skill(s).`);
    } catch (err) {
      logLocal("sync.refresh", "error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRescanCli(tool: SupportedTool): Promise<void> {
    if (!sharedRoot) {
      window.alert(t("root.noRootAlert"));
      return;
    }
    setInspectorBusy((prev) => ({ ...prev, [tool]: true }));
    try {
      const entries = await api.scanCliTool(tool, sharedRoot);
      setInspector((prev) => ({ ...prev, [tool]: entries }));
      // 重扫 CLI 目录通常会解决 conflict，顺便刷新整体同步状态。
      if (skills.length > 0) {
        const map = await refreshSyncStatuses(skills);
        setSyncStatus(map);
      }
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setInspectorBusy((prev) => ({ ...prev, [tool]: false }));
    }
  }

  async function handleImport(): Promise<void> {
    if (!sharedRoot) {
      window.alert(t("root.noRootAlert"));
      return;
    }
    try {
      const picked = await api.selectSkillFolder();
      if (!picked) return;
      const skill = await api.importSkillFolder(picked, sharedRoot);
      await runScanFlow(sharedRoot);
      setSelectedSkillPath(skill.path);
      // 导入会把一个外部目录复制进共享根 —— 这很可能让 git 树变脏。
      // 主动拉一次 status，比等 30s 轮询更贴合"刚操作完想马上看到"的预期。
      void refreshGitStatus();
    } catch (err) {
      window.alert(t("action.importFail", { message: (err as Error).message }));
    }
  }

  async function handleSyncOne(skill: SkillInfo, toolName: ToolName): Promise<void> {
    await actions.syncOne(skill, toolName);
    // syncOne 本身只改 CLI 目录下的 junction，不动共享根，所以
    // 一般不影响 git 状态；但保险起见刷一次（非常便宜，hook 内部有 inflight 守卫）。
    void refreshGitStatus();
  }

  async function handleOpenRoot(): Promise<void> {
    if (!sharedRoot) return;
    try {
      await api.openPath(sharedRoot);
    } catch (err) {
      window.alert(t("action.openFail", { message: (err as Error).message }));
    }
  }

  async function handleChangeMetadata(
    skill: SkillInfo,
    patch: { hidden?: boolean; frozen?: boolean; origin?: SkillOrigin },
  ): Promise<void> {
    if (!sharedRoot) return;
    try {
      const entry = await api.setSkillMetadata(sharedRoot, skill.name, patch);
      setSkills((prev) =>
        prev.map((s) =>
          s.path === skill.path
            ? {
                ...s,
                hidden: entry.hidden ?? s.hidden,
                frozen: entry.frozen ?? s.frozen,
                origin: (entry.origin as SkillOrigin) || s.origin,
              }
            : s,
        ),
      );
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  async function handleInspectorUnlink(entry: CliSkillEntry): Promise<void> {
    const confirmed = window.confirm(t("inspector.confirm.unlink", { path: entry.path }));
    if (!confirmed) return;
    try {
      await api.unlinkSkill(entry.toolName as SupportedTool, entry.skillName);
      await handleRescanCli(entry.toolName as SupportedTool);
      // unlink 只碰 CLI junction，不动共享根，但顺手刷一下避免漏掉边角情况。
      void refreshGitStatus();
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  async function handleInspectorImport(
    entry: CliSkillEntry,
    origin: "owned" | "vendored",
  ): Promise<void> {
    if (!sharedRoot) {
      window.alert(t("root.noRootAlert"));
      return;
    }
    try {
      const skill = await api.importSkillFromCli(
        entry.toolName as SupportedTool,
        entry.skillName,
        sharedRoot,
        origin,
      );
      await runScanFlow(sharedRoot);
      setSelectedSkillPath(skill.path);
      await handleRescanCli(entry.toolName as SupportedTool);
      // 从 CLI 导入 = 把外部目录复制进共享根，几乎必然让 git 变脏。
      void refreshGitStatus();
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  async function handleInspectorOpen(entry: CliSkillEntry): Promise<void> {
    try {
      await api.openPath(entry.path);
    } catch (err) {
      window.alert(t("action.openFail", { message: (err as Error).message }));
    }
  }

  const selectedSkill = skills.find((s) => s.path === selectedSkillPath) ?? null;
  const selectedSyncStatus = selectedSkill ? syncStatus[selectedSkill.path] : undefined;
  const hasAnyInspectorEntries = inspector.claude.length + inspector.codex.length > 0;

  const split = useVerticalSplit("ssm.split.tableHeight.v1", {
    defaultTop: 280,
    minTop: 120,
    minBottom: 200,
  });

  const onUnlinkFromTable = useCallback(
    (skill: SkillInfo, tool: ToolName) => {
      if (tool !== "claude" && tool !== "codex") return;
      void actions.unlinkOne(skill, tool);
    },
    [actions],
  );

  const onBulkSyncFromBar = useCallback(
    (tool: ToolName) => {
      if (tool !== "claude" && tool !== "codex") return;
      void actions.bulkSync(tool);
    },
    [actions],
  );
  const onBulkUnlinkFromBar = useCallback(
    (tool: ToolName) => {
      if (tool !== "claude" && tool !== "codex") return;
      void actions.bulkUnlink(tool);
    },
    [actions],
  );

  return (
    <div className="app">
      <RootSelector
        value={sharedRoot}
        onChange={setSharedRoot}
        onBrowse={handleBrowseRoot}
        onScan={handleScan}
        onImport={handleImport}
        onOpenRoot={handleOpenRoot}
        onRefreshSync={handleRefreshSync}
        onRescanClaude={() => handleRescanCli("claude")}
        onRescanCodex={() => handleRescanCli("codex")}
        busy={busy}
      />

      <div className="main-grid">
        <div className="sidebar">
          {platformWarning ? <div className="banner">{t("app.platformWarning")}</div> : null}
          <GitStatusPanel status={gitStatus} />
          <ToolStatusPanel tools={tools} />
        </div>

        <div className="content">
          {skills.length > 0 ? (
            <GlobalSyncBar
              skills={skills}
              syncStatus={syncStatus}
              onBulkSync={onBulkSyncFromBar}
              onBulkUnlink={onBulkUnlinkFromBar}
            />
          ) : null}

          <div
            ref={split.containerRef}
            className={`split-vertical ${split.dragging ? "split-dragging" : ""}`}
          >
            <div className="split-top" style={{ height: split.topHeight }}>
              <SkillTable
                skills={skills}
                syncStatus={syncStatus}
                pending={actions.pending}
                selectedPath={selectedSkillPath}
                onSelect={setSelectedSkillPath}
                onSync={handleSyncOne}
                onUnlink={onUnlinkFromTable}
                showHidden={showHidden}
                onToggleShowHidden={setShowHidden}
              />
            </div>

            <div
              className="split-handle"
              onMouseDown={split.onHandleMouseDown}
              role="separator"
              aria-orientation="horizontal"
              title={t("split.resize")}
            >
              <span className="split-handle-grip" />
            </div>

            <div className="split-bottom">
              <div className="panel skill-detail-panel">
                <div className="panel-header">{t("detail.header")}</div>
                <div className="panel-body detail-info-body">
                  <SkillDetail
                    skill={selectedSkill}
                    syncStatus={selectedSyncStatus}
                    onChangeMetadata={handleChangeMetadata}
                  />
                </div>
              </div>
            </div>
          </div>

          {hasAnyInspectorEntries ? (
            <div className="inspector-row-wrap">
              {inspector.claude.length > 0 && (
                <ToolInspectorPanel
                  tool="claude"
                  entries={inspector.claude}
                  scanning={inspectorBusy.claude}
                  ignored={ignoredPaths.ignored}
                  onUnlink={handleInspectorUnlink}
                  onImport={handleInspectorImport}
                  onOpen={handleInspectorOpen}
                  onIgnore={(e) => {
                    ignoredPaths.ignore(e.path);
                    logLocal("inspector.ignore", "info", `Ignored ${e.path}`);
                  }}
                  onUnignore={(path) => {
                    ignoredPaths.unignore(path);
                    logLocal("inspector.unignore", "info", `Restored ${path}`);
                  }}
                  onClose={() => {
                    setInspector((prev) => ({ ...prev, claude: [] }));
                    logLocal("inspector.close", "info", "Closed the Claude CLI inspector panel.");
                  }}
                />
              )}
              {inspector.codex.length > 0 && (
                <ToolInspectorPanel
                  tool="codex"
                  entries={inspector.codex}
                  scanning={inspectorBusy.codex}
                  ignored={ignoredPaths.ignored}
                  onUnlink={handleInspectorUnlink}
                  onImport={handleInspectorImport}
                  onOpen={handleInspectorOpen}
                  onIgnore={(e) => {
                    ignoredPaths.ignore(e.path);
                    logLocal("inspector.ignore", "info", `Ignored ${e.path}`);
                  }}
                  onUnignore={(path) => {
                    ignoredPaths.unignore(path);
                    logLocal("inspector.unignore", "info", `Restored ${path}`);
                  }}
                  onClose={() => {
                    setInspector((prev) => ({ ...prev, codex: [] }));
                    logLocal("inspector.close", "info", "Closed the Codex CLI inspector panel.");
                  }}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>

      <LogPanel entries={logs} onClear={() => setLogs([])} />
      <ScanProgressOverlay open={busy} onCancel={cancelScan} />
    </div>
  );
}
