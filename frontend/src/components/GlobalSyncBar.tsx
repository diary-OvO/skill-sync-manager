import type { MouseEvent } from "react";
import { ALL_TOOLS, type SkillInfo, type ToolName, isSupportedTool } from "../types";
import { TOOL_ACCENT, TOOL_LABEL, TOOL_LOGO } from "../assets/toolLogos";
import { useLanguage } from "../i18n";
import type { SyncStatusMap } from "../hooks/useSyncActions";

type Aggregate =
  | { state: "synced"; total: number }
  | { state: "missing"; total: number }
  | { state: "partial"; synced: number; total: number }
  | { state: "unsupported" }
  | { state: "empty" };

/** 某个 tool 列在"可批量操作"的 skill 子集上的聚合状态。
 *  与 useSyncActions.bulkSync 的选集保持一致：valid && !hidden && !frozen。 */
function aggregateForTool(
  skills: SkillInfo[],
  syncStatus: SyncStatusMap,
  tool: ToolName,
): Aggregate {
  if (!isSupportedTool(tool)) return { state: "unsupported" };
  const targets = skills.filter((s) => s.valid && !s.hidden && !s.frozen);
  if (targets.length === 0) return { state: "empty" };
  let synced = 0;
  for (const s of targets) {
    if (syncStatus[s.path]?.[tool]?.state === "synced") synced++;
  }
  if (synced === 0) return { state: "missing", total: targets.length };
  if (synced === targets.length) return { state: "synced", total: targets.length };
  return { state: "partial", synced, total: targets.length };
}

export interface GlobalSyncBarProps {
  skills: SkillInfo[];
  syncStatus: SyncStatusMap;
  onBulkSync: (tool: ToolName) => void;
  onBulkUnlink: (tool: ToolName) => void;
}

export function GlobalSyncBar({
  skills,
  syncStatus,
  onBulkSync,
  onBulkUnlink,
}: GlobalSyncBarProps) {
  const { t } = useLanguage();

  const handleClick = (tool: ToolName, agg: Aggregate, e: MouseEvent<HTMLButtonElement>) => {
    if (agg.state === "unsupported" || agg.state === "empty") return;
    // synced 全部解除；missing 全部同步；
    // partial 默认补齐，Alt-Click 改为全部解除。
    if (agg.state === "synced") {
      onBulkUnlink(tool);
      return;
    }
    if (agg.state === "missing") {
      onBulkSync(tool);
      return;
    }
    if (e.altKey) onBulkUnlink(tool);
    else onBulkSync(tool);
  };

  return (
    <div className="global-sync-bar" role="toolbar" aria-label={t("toggle.globalBar.label")}>
      <span className="global-sync-bar-title">{t("toggle.globalBar.title")}</span>
      <div className="global-sync-bar-buttons">
        {ALL_TOOLS.map((tool) => {
          const agg = aggregateForTool(skills, syncStatus, tool);
          const Logo = TOOL_LOGO[tool];
          const accent = TOOL_ACCENT[tool];
          const label = TOOL_LABEL[tool];
          const disabled = agg.state === "unsupported" || agg.state === "empty";

          const ariaChecked: boolean | "mixed" =
            agg.state === "synced" ? true : agg.state === "partial" ? "mixed" : false;

          const total = "total" in agg ? agg.total : 0;
          const syncedN = agg.state === "partial" ? agg.synced : agg.state === "synced" ? total : 0;

          const stateLabel = t(`toggle.globalBar.state.${agg.state}`);
          const hint =
            agg.state === "partial"
              ? t("toggle.globalBar.hint.partial", {
                  tool: label,
                  n: String(syncedN),
                  total: String(total),
                })
              : agg.state === "synced"
                ? t("toggle.globalBar.hint.synced", { tool: label, total: String(total) })
                : agg.state === "missing"
                  ? t("toggle.globalBar.hint.missing", { tool: label, total: String(total) })
                  : agg.state === "unsupported"
                    ? t("toggle.globalBar.hint.unsupported", { tool: label })
                    : t("toggle.globalBar.hint.empty");
          const tooltip = `${label} · ${stateLabel}\n${hint}`;
          const ariaLabel = `${label}: ${stateLabel}. ${hint}`;

          // partial 圆环：用 conic-gradient 精确画 synced/total 扇形。
          const ringStyle =
            agg.state === "partial"
              ? ({
                  ["--ring-ratio" as string]: `${(syncedN / total) * 360}deg`,
                } as React.CSSProperties)
              : undefined;

          return (
            <button
              key={tool}
              type="button"
              role="switch"
              aria-checked={ariaChecked}
              aria-label={ariaLabel}
              aria-disabled={disabled || undefined}
              disabled={disabled}
              title={tooltip}
              className={`tool-toggle tool-toggle--lg tool-toggle--${agg.state}`}
              style={{ ["--tool-accent" as string]: accent, ...ringStyle }}
              onClick={(e) => handleClick(tool, agg, e)}
            >
              <Logo className="tool-toggle-icon" width={18} height={18} />
              {agg.state === "partial" ? (
                <span className="tool-toggle-count" aria-hidden>
                  {syncedN}/{total}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
