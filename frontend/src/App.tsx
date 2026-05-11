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
import { ActionPanel } from "./components/ActionPanel";
import { LogPanel } from "./components/LogPanel";
import { ToolInspectorPanel } from "./components/ToolInspectorPanel";
import { useHorizontalSplit, useVerticalSplit } from "./hooks/useDragResize";
import { useShutdownCleanup } from "./hooks/useShutdownCleanup";
import { useLanguage } from "./i18n";

export type SyncStatusMap = Record<string, Partial<Record<ToolName, SyncStatus>>>;

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
  const { t } = useLanguage();

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
  // Holds the Wails "log:entry" unsubscribe so shutdown cleanup can invoke it
  // even if the normal React unmount path doesn't fire in time (e.g. pagehide
  // on window close beats useEffect cleanup).
  const logUnsubRef = useRef<(() => void) | null>(null);

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
        /* history not yet available */
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
        appendLog({
          timestamp: new Date().toISOString(),
          action: "startup",
          result: "error",
          message: (err as Error).message,
        });
      }
    })();

    const unsubscribe = api.onLog((entry) => {
      appendLog(entry);
    });
    logUnsubRef.current = unsubscribe;
    return () => {
      unsubscribe();
      logUnsubRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronous, idempotent cleanup invoked on pagehide/beforeunload and on
  // unmount. Any UI-side state that needs to be durable across a close must
  // be committed before this returns.
  //
  // Today the only live subscription is the Wails log-entry listener; drag
  // sizes are already persisted on every change (see useDragResize.ts), so
  // there's nothing else to flush here. Add future teardown (timers, web
  // workers, pending fetch aborts) to this function.
  const onShutdown = useCallback(() => {
    try {
      logUnsubRef.current?.();
      logUnsubRef.current = null;
    } catch {
      /* ignore — Wails runtime may already be torn down */
    }
  }, []);
  useShutdownCleanup(onShutdown);

  function appendLog(entry: LogEntry): void {
    setLogs((prev) => {
      const next = [...prev, entry];
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
  }

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
      // Fall back to per-skill calls if the batch endpoint is unavailable.
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
    setBusy(true);
    try {
      const [scanned, git, toolList] = await Promise.all([
        api.scanSkills(root),
        api.getGitStatus(root),
        api.detectCliTools(),
      ]);
      setSkills(scanned);
      setGitStatus(git);
      setTools(toolList);
      const statuses = await refreshSyncStatuses(scanned);
      setSyncStatus(statuses);
      if (scanned.length > 0 && !scanned.find((s) => s.path === selectedSkillPath)) {
        setSelectedSkillPath(scanned[0].path);
      }
    } catch (err) {
      appendLog({
        timestamp: new Date().toISOString(),
        action: "scan",
        result: "error",
        message: (err as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }

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
      /* non-fatal */
    }
    await runScanFlow(sharedRoot);
  }

  async function handleRefreshSync(): Promise<void> {
    if (skills.length === 0) return;
    setBusy(true);
    try {
      const map = await refreshSyncStatuses(skills);
      setSyncStatus(map);
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
      // Rescanning a CLI dir often unblocks a conflict — refresh overall sync.
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
    } catch (err) {
      window.alert(t("action.importFail", { message: (err as Error).message }));
    }
  }

  async function handleSyncOne(skill: SkillInfo, toolName: ToolName): Promise<void> {
    setBusy(true);
    try {
      const status = await api.syncSkillToTool(skill, toolName);
      setSyncStatus((prev) => ({
        ...prev,
        [skill.path]: { ...(prev[skill.path] ?? {}), [toolName]: status },
      }));
      if (status.state === "unsupported") {
        window.alert(t("action.unsupportedAlert", { tool: toolName }));
      } else if (status.state === "conflict") {
        window.alert(
          t("action.conflictAlert", {
            name: skill.name,
            tool: toolName,
            message: status.message,
          }),
        );
      } else if (status.state === "error") {
        window.alert(
          t("action.errorAlert", {
            name: skill.name,
            tool: toolName,
            message: status.message,
          }),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncMany(
    target: "claude" | "codex" | "both",
    scope: "selected" | "all",
  ): Promise<void> {
    const baseList = scope === "all" ? skills : selectedSkill ? [selectedSkill] : [];
    if (baseList.length === 0) {
      window.alert(t("action.noSelectedAlert"));
      return;
    }
    // For scope=all, skip hidden + frozen. For scope=selected, honor the user's choice.
    const list = scope === "all" ? baseList.filter((s) => !s.hidden && !s.frozen) : baseList;
    if (list.length === 0) {
      // Everything was filtered out — show a log note so the user knows why nothing happened.
      appendLog({
        timestamp: new Date().toISOString(),
        action: "sync:batch",
        result: "info",
        message: "All skills are hidden or frozen; nothing to sync.",
      });
      return;
    }
    setBusy(true);
    try {
      const targets: ToolName[] = target === "both" ? ["claude", "codex"] : [target];
      for (const skill of list) {
        for (const tool of targets) {
          const status = await api.syncSkillToTool(skill, tool);
          setSyncStatus((prev) => ({
            ...prev,
            [skill.path]: { ...(prev[skill.path] ?? {}), [tool]: status },
          }));
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function handleUnsupportedSync(tool: string): void {
    window.alert(t("action.unsupportedAlert", { tool }));
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

  // Horizontal split inside the detail panel: info on the left, actions on
  // the right. Persisted independently so users can tune table-vs-detail and
  // info-vs-actions without stepping on each other.
  const detailSplit = useHorizontalSplit("ssm.split.detailLeft.v1", {
    defaultLeft: 560,
    minLeft: 280,
    minRight: 220,
  });

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
          <div
            ref={split.containerRef}
            className={`split-vertical ${split.dragging ? "split-dragging" : ""}`}
          >
            <div className="split-top" style={{ height: split.topHeight }}>
              <SkillTable
                skills={skills}
                syncStatus={syncStatus}
                selectedPath={selectedSkillPath}
                onSelect={setSelectedSkillPath}
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
                <div
                  ref={detailSplit.containerRef}
                  className={`detail-split ${detailSplit.dragging ? "split-dragging" : ""}`}
                >
                  <div className="detail-split-left" style={{ width: detailSplit.leftWidth }}>
                    <div className="panel-body detail-info-body">
                      <SkillDetail
                        skill={selectedSkill}
                        syncStatus={selectedSyncStatus}
                        onChangeMetadata={handleChangeMetadata}
                      />
                    </div>
                  </div>

                  <div
                    className="split-handle split-handle-col"
                    onMouseDown={detailSplit.onHandleMouseDown}
                    role="separator"
                    aria-orientation="vertical"
                    title={t("split.resize")}
                  >
                    <span className="split-handle-grip" />
                  </div>

                  <div className="detail-split-right">
                    <div className="panel-body detail-actions-body">
                      <ActionPanel
                        selectedSkill={selectedSkill}
                        anySkills={skills.length > 0}
                        busy={busy}
                        onSyncOne={handleSyncOne}
                        onSyncMany={handleSyncMany}
                        onUnsupportedSync={handleUnsupportedSync}
                      />
                    </div>
                  </div>
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
                  onUnlink={handleInspectorUnlink}
                  onImport={handleInspectorImport}
                  onOpen={handleInspectorOpen}
                />
              )}
              {inspector.codex.length > 0 && (
                <ToolInspectorPanel
                  tool="codex"
                  entries={inspector.codex}
                  scanning={inspectorBusy.codex}
                  onUnlink={handleInspectorUnlink}
                  onImport={handleInspectorImport}
                  onOpen={handleInspectorOpen}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>

      <LogPanel entries={logs} />
    </div>
  );
}
