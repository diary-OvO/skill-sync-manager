import type { MouseEvent } from "react";
import type { SkillInfo, SyncStatus, ToolName } from "../types";
import { isSupportedTool } from "../types";
import { TOOL_ACCENT, TOOL_LABEL, TOOL_LOGO } from "../assets/toolLogos";
import { useLanguage } from "../i18n";

// 按钮的 6 种外观状态。busy 与语义状态并列：
// 语义状态决定"下一次点击的动作"；busy 只影响视觉和禁用。
export type ToggleState = "synced" | "missing" | "conflict" | "invalid" | "unsupported";

export interface ToggleStateInfo {
  state: ToggleState;
  /** 传给后端时用到的目标路径，给 tooltip 显示也方便。 */
  targetPath?: string;
  /** conflict / error 的消息。 */
  message?: string;
}

/** 从 skill 元信息 + 当前同步状态 派生出按钮该显示什么。
 *  表格行、全局栏、tooltip 都应该走这一个真源。 */
export function resolveToggleState(
  skill: SkillInfo,
  syncStatus: SyncStatus | undefined,
  tool: ToolName,
): ToggleStateInfo {
  if (!isSupportedTool(tool)) return { state: "unsupported" };
  if (!skill.valid) return { state: "invalid" };
  if (!syncStatus) return { state: "missing" };
  switch (syncStatus.state) {
    case "synced":
      return { state: "synced", targetPath: syncStatus.targetPath };
    case "conflict":
      return { state: "conflict", targetPath: syncStatus.targetPath, message: syncStatus.message };
    case "invalid":
    case "error":
      return { state: "invalid", message: syncStatus.message };
    case "unsupported":
      return { state: "unsupported" };
    case "missing":
    default:
      return { state: "missing", targetPath: syncStatus.targetPath };
  }
}

export interface ToolToggleProps {
  tool: ToolName;
  info: ToggleStateInfo;
  busy?: boolean;
  /** true 时按钮尺寸更大（全局栏用）。 */
  large?: boolean;
  onSync: (tool: ToolName) => void;
  onUnlink: (tool: ToolName, e: MouseEvent<HTMLButtonElement>) => void;
}

export function ToolToggle({ tool, info, busy, large, onSync, onUnlink }: ToolToggleProps) {
  const { t } = useLanguage();
  const label = TOOL_LABEL[tool];
  const Logo = TOOL_LOGO[tool];
  const accent = TOOL_ACCENT[tool];

  const { state } = info;
  const disabled = state === "unsupported" || state === "invalid" || busy;
  const ariaChecked: boolean | "mixed" =
    state === "synced" ? true : state === "conflict" ? "mixed" : false;

  // tooltip：一行状态 + 一行动作提示。
  const stateLabel = t(`toggle.state.${state}`);
  const actionHint =
    state === "synced"
      ? t("toggle.action.unlinkHint", { tool: label })
      : state === "missing"
        ? t("toggle.action.syncHint", { tool: label })
        : state === "conflict"
          ? t("toggle.action.conflictHint", { tool: label })
          : state === "unsupported"
            ? t("toggle.action.unsupportedHint", { tool: label })
            : t("toggle.action.invalidHint");
  const tooltip = `${label} · ${stateLabel}\n${actionHint}${info.message ? `\n${info.message}` : ""}`;
  const ariaLabel = `${label}: ${stateLabel}. ${actionHint}`;

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (state === "synced") {
      onUnlink(tool, e);
      return;
    }
    // missing / conflict：都走同步路径；conflict 的具体冲突会在后端返回。
    onSync(tool);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={ariaChecked}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      data-busy={busy ? "true" : undefined}
      title={tooltip}
      onClick={handleClick}
      className={`tool-toggle tool-toggle--${state}${large ? " tool-toggle--lg" : ""}`}
      style={{ ["--tool-accent" as string]: accent }}
    >
      <Logo className="tool-toggle-icon" width={large ? 18 : 14} height={large ? 18 : 14} />
      {state === "conflict" ? <span className="tool-toggle-conflict" aria-hidden>!</span> : null}
      {state === "invalid" ? <span className="tool-toggle-strike" aria-hidden /> : null}
      {busy ? <span className="tool-toggle-spinner" aria-hidden /> : null}
    </button>
  );
}
