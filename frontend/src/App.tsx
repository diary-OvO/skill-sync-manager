import { useEffect, useRef, useState } from "react";
import { wailsApi as api } from "./lib/wailsApi";
import type {
  GitStatus,
  LogEntry,
  SkillInfo,
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
import { useLanguage } from "./i18n";

export type SyncStatusMap = Record<string, Partial<Record<ToolName, SyncStatus>>>;

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
  const didInit = useRef(false);

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
    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function appendLog(entry: LogEntry): void {
    setLogs((prev) => {
      const next = [...prev, entry];
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
  }

  async function refreshSyncStatuses(list: SkillInfo[]): Promise<SyncStatusMap> {
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
    const list = scope === "all" ? skills : selectedSkill ? [selectedSkill] : [];
    if (list.length === 0) {
      window.alert(t("action.noSelectedAlert"));
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

  const selectedSkill = skills.find((s) => s.path === selectedSkillPath) ?? null;
  const selectedSyncStatus = selectedSkill ? syncStatus[selectedSkill.path] : undefined;

  return (
    <div className="app">
      <RootSelector
        value={sharedRoot}
        onChange={setSharedRoot}
        onBrowse={handleBrowseRoot}
        onScan={handleScan}
        onImport={handleImport}
        onOpenRoot={handleOpenRoot}
        busy={busy}
      />

      <div className="main-grid">
        <div className="sidebar">
          {platformWarning ? <div className="banner">{t("app.platformWarning")}</div> : null}
          <GitStatusPanel status={gitStatus} />
          <ToolStatusPanel tools={tools} />
        </div>

        <div className="content">
          <SkillTable
            skills={skills}
            syncStatus={syncStatus}
            selectedPath={selectedSkillPath}
            onSelect={setSelectedSkillPath}
          />

          <div className="panel skill-detail-panel">
            <div className="panel-header">{t("detail.header")}</div>
            <div className="panel-body">
              <SkillDetail skill={selectedSkill} syncStatus={selectedSyncStatus} />
              <div style={{ height: 12 }} />
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

      <LogPanel entries={logs} />
    </div>
  );
}
