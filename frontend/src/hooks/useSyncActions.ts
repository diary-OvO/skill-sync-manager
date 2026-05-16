import { useCallback, useRef, useState } from "react";
import { wailsApi as api } from "../lib/wailsApi";
import {
  type SkillInfo,
  type SupportedTool,
  type SyncStatus,
  type ToolName,
  isSupportedTool,
} from "../types";
import { useToast } from "../components/Toast";
import { useLanguage } from "../i18n";
import { TOOL_LABEL } from "../assets/toolLogos";

export type SyncStatusMap = Record<string, Partial<Record<ToolName, SyncStatus>>>;

/** `${skill.path}::${tool}` 的 busy 集合。 */
export type PendingSet = ReadonlySet<string>;

const pendingKey = (path: string, tool: ToolName) => `${path}::${tool}`;

function isDownloadedSourceForTool(skill: SkillInfo, status: SyncStatus | undefined): boolean {
  if (skill.origin !== "vendored" || !skill.importedFrom || !status?.targetPath) return false;
  return normalizePath(skill.importedFrom) === normalizePath(status.targetPath);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export interface UseSyncActionsDeps {
  skills: SkillInfo[];
  syncStatus: SyncStatusMap;
  mergeSyncStatus: (path: string, tool: ToolName, status: SyncStatus) => void;
  refreshOne: (skill: SkillInfo, tool: ToolName) => Promise<void>;
}

export interface UseSyncActions {
  pending: PendingSet;
  /** 同步单个 skill 到单个工具。 */
  syncOne: (skill: SkillInfo, tool: ToolName) => Promise<void>;
  /** 解除单个 skill 在单个工具下的链接；首次会弹 confirm。 */
  unlinkOne: (skill: SkillInfo, tool: ToolName) => Promise<void>;
  /** 把 tool 列下所有缺失 / conflict 的 skill 补齐。 */
  bulkSync: (tool: SupportedTool) => Promise<void>;
  /** 解除 tool 列下所有已同步的 skill；首次弹 confirm。 */
  bulkUnlink: (tool: SupportedTool) => Promise<void>;
}

/** 封装同步 / 解除 / 批量同步 / 批量解除的业务。
 *  - 维护 pending 集合，UI 由此决定 busy。
 *  - 首次 unlink / bulkUnlink 弹 confirm，之后走 undo toast。
 *  - 失败时通过 toast 提示，不中断 UI。 */
export function useSyncActions({
  skills,
  syncStatus,
  mergeSyncStatus,
  refreshOne,
}: UseSyncActionsDeps): UseSyncActions {
  const toast = useToast();
  const { t } = useLanguage();
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const confirmedSingleUnlink = useRef(false);
  const confirmedBulkUnlink = useRef(false);

  const mark = useCallback((key: string, on: boolean) => {
    setPending((prev) => {
      if (on === prev.has(key)) return prev;
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const syncOne = useCallback<UseSyncActions["syncOne"]>(
    async (skill, tool) => {
      const key = pendingKey(skill.path, tool);
      if (pendingRef.current.has(key)) return;
      mark(key, true);
      try {
        const status = await api.syncSkillToTool(skill, tool);
        mergeSyncStatus(skill.path, tool, status);
        if (status.state === "conflict") {
          toast.push({
            kind: "error",
            message: t("toggle.toast.conflict", {
              name: skill.name,
              tool: TOOL_LABEL[tool],
              message: status.message,
            }),
          });
        } else if (status.state === "error") {
          toast.push({
            kind: "error",
            message: t("toggle.toast.error", {
              name: skill.name,
              tool: TOOL_LABEL[tool],
              message: status.message,
            }),
          });
        } else if (status.state === "unsupported") {
          toast.push({
            kind: "info",
            message: t("toggle.toast.unsupported", { tool: TOOL_LABEL[tool] }),
          });
        }
      } catch (err) {
        toast.push({ kind: "error", message: (err as Error).message });
      } finally {
        mark(key, false);
      }
    },
    [mark, mergeSyncStatus, t, toast],
  );

  const unlinkOne = useCallback<UseSyncActions["unlinkOne"]>(
    async (skill, tool) => {
      if (!isSupportedTool(tool)) return;
      const key = pendingKey(skill.path, tool);
      if (pendingRef.current.has(key)) return;
      if (!confirmedSingleUnlink.current) {
        const ok = window.confirm(
          t("toggle.confirm.unlinkOne", { name: skill.name, tool: TOOL_LABEL[tool] }),
        );
        if (!ok) return;
        confirmedSingleUnlink.current = true;
      }
      mark(key, true);
      try {
        await api.unlinkSkill(tool, skill.name);
        await refreshOne(skill, tool);
        toast.push({
          kind: "success",
          message: t("toggle.toast.unlinked", { name: skill.name, tool: TOOL_LABEL[tool] }),
          action: {
            label: t("toggle.toast.undo"),
            onPerform: () => {
              void syncOne(skill, tool);
            },
          },
        });
      } catch (err) {
        toast.push({ kind: "error", message: (err as Error).message });
      } finally {
        mark(key, false);
      }
    },
    [mark, refreshOne, syncOne, t, toast],
  );

  const bulkSync = useCallback<UseSyncActions["bulkSync"]>(
    async (tool) => {
      // 和原 handleSyncMany('...', 'all') 范围一致：跳过 hidden / frozen / invalid。
      const targets = skills.filter((s) => s.valid && !s.hidden && !s.frozen);
      const need = targets.filter((s) => {
        const st = syncStatus[s.path]?.[tool]?.state;
        return st !== "synced";
      });
      if (need.length === 0) {
        toast.push({ kind: "info", message: t("toggle.toast.allSynced", { tool: TOOL_LABEL[tool] }) });
        return;
      }
      await Promise.all(need.map((s) => syncOne(s, tool)));
      toast.push({
        kind: "success",
        message: t("toggle.toast.bulkSynced", { n: String(need.length), tool: TOOL_LABEL[tool] }),
      });
    },
    [skills, syncStatus, syncOne, t, toast],
  );

  const bulkUnlink = useCallback<UseSyncActions["bulkUnlink"]>(
    async (tool) => {
      const targets = skills.filter((s) => s.valid && !s.hidden && !s.frozen);
      const synced = targets.filter((s) => {
        const status = syncStatus[s.path]?.[tool];
        return status?.state === "synced" && !isDownloadedSourceForTool(s, status);
      });
      if (synced.length === 0) {
        toast.push({
          kind: "info",
          message: t("toggle.toast.nothingToUnlink", { tool: TOOL_LABEL[tool] }),
        });
        return;
      }
      if (!confirmedBulkUnlink.current) {
        const ok = window.confirm(
          t("toggle.confirm.unlinkBulk", {
            n: String(synced.length),
            tool: TOOL_LABEL[tool],
          }),
        );
        if (!ok) return;
        confirmedBulkUnlink.current = true;
        confirmedSingleUnlink.current = true;
      }
      await Promise.all(
        synced.map(async (s) => {
          const key = pendingKey(s.path, tool);
          mark(key, true);
          try {
            await api.unlinkSkill(tool, s.name);
            await refreshOne(s, tool);
          } catch (err) {
            toast.push({ kind: "error", message: (err as Error).message });
          } finally {
            mark(key, false);
          }
        }),
      );
      toast.push({
        kind: "success",
        message: t("toggle.toast.bulkUnlinked", {
          n: String(synced.length),
          tool: TOOL_LABEL[tool],
        }),
        action: {
          label: t("toggle.toast.undo"),
          onPerform: () => {
            void Promise.all(synced.map((s) => syncOne(s, tool)));
          },
        },
      });
    },
    [skills, syncStatus, mark, refreshOne, syncOne, t, toast],
  );

  return { pending, syncOne, unlinkOne, bulkSync, bulkUnlink };
}
