import { useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
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

export type SyncStatusMap = Record<string, Partial<Record<ToolName, SyncStatus>>>;

export function App() {
  const [sharedRoot, setSharedRoot] = useState<string>("");
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkillPath, setSelectedSkillPath] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatusMap>({});
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [platformWarning, setPlatformWarning] = useState<string | null>(null);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    (async () => {
      if (!navigator.userAgent.toLowerCase().includes("windows")) {
        setPlatformWarning(
          "Current version only supports Windows directory junction sync. The UI still loads, but sync actions will report errors on other platforms.",
        );
      }
      const history = await api.logHistory();
      setLogs(history);
      const settings = await api.loadSettings();
      if (settings.sharedRoot) {
        setSharedRoot(settings.sharedRoot);
        await runScanFlow(settings.sharedRoot);
      } else {
        // still refresh tools + git so user sees state
        const t = await api.detectCliTools();
        setTools(t);
      }
    })();

    const unsubscribe = api.onLog((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry];
        return next.length > 500 ? next.slice(next.length - 500) : next;
      });
    });
    return () => {
      unsubscribe();
    };
  }, []);

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
    } finally {
      setBusy(false);
    }
  }

  async function handleBrowseRoot(): Promise<void> {
    const picked = await api.selectRoot();
    if (!picked) return;
    setSharedRoot(picked);
    await api.saveSettings({ sharedRoot: picked });
    await runScanFlow(picked);
  }

  async function handleScan(): Promise<void> {
    if (!sharedRoot) return;
    await api.saveSettings({ sharedRoot });
    await runScanFlow(sharedRoot);
  }

  async function handleImport(): Promise<void> {
    if (!sharedRoot) {
      window.alert("Please select a shared skill root first.");
      return;
    }
    const picked = await api.selectSkillFolder();
    if (!picked) return;
    const result = await api.importSkillFolder(picked, sharedRoot);
    if (!result.ok) {
      window.alert(`Import failed:\n${result.message}`);
      return;
    }
    await runScanFlow(sharedRoot);
    setSelectedSkillPath(result.skill.path);
  }

  async function handleSyncOne(skill: SkillInfo, toolName: ToolName): Promise<void> {
    setBusy(true);
    try {
      const status = await api.syncSkill(skill, toolName);
      setSyncStatus((prev) => ({
        ...prev,
        [skill.path]: { ...(prev[skill.path] ?? {}), [toolName]: status },
      }));
      if (status.state === "unsupported") {
        window.alert(`Sync to ${toolName} is not yet supported.`);
      } else if (status.state === "conflict") {
        window.alert(`Conflict syncing ${skill.name} to ${toolName}:\n${status.message}`);
      } else if (status.state === "error") {
        window.alert(`Error syncing ${skill.name} to ${toolName}:\n${status.message}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncMany(
    target: "claude" | "codex" | "both",
    scope: "selected" | "all",
  ): Promise<void> {
    const list =
      scope === "all"
        ? skills
        : selectedSkill
          ? [selectedSkill]
          : [];
    if (list.length === 0) {
      window.alert("No skill selected.");
      return;
    }
    setBusy(true);
    try {
      const targets: ToolName[] =
        target === "both" ? ["claude", "codex"] : [target];
      for (const skill of list) {
        for (const t of targets) {
          const status = await api.syncSkill(skill, t);
          setSyncStatus((prev) => ({
            ...prev,
            [skill.path]: { ...(prev[skill.path] ?? {}), [t]: status },
          }));
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function handleUnsupportedSync(tool: string): void {
    window.alert(`Sync to ${tool} is not yet supported.`);
  }

  async function handleOpenRoot(): Promise<void> {
    if (!sharedRoot) return;
    await api.openPath(sharedRoot);
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
          {platformWarning ? <div className="banner">{platformWarning}</div> : null}
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

          <div className="panel">
            <div className="panel-header">Selected Skill</div>
            <div className="panel-body">
              <SkillDetail
                skill={selectedSkill}
                syncStatus={selectedSyncStatus}
              />
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
