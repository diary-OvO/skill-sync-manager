import type { SkillInfo, ToolName } from "../types";
import { useLanguage } from "../i18n";

interface Props {
  selectedSkill: SkillInfo | null;
  anySkills: boolean;
  busy: boolean;
  onSyncOne: (skill: SkillInfo, tool: ToolName) => void;
  onSyncMany: (target: "claude" | "codex" | "both", scope: "selected" | "all") => void;
  onUnsupportedSync: (tool: string) => void;
}

export function ActionPanel(props: Props) {
  const { selectedSkill, anySkills, busy, onSyncOne, onSyncMany, onUnsupportedSync } = props;
  const { t } = useLanguage();
  const canSyncSelected = !!selectedSkill && selectedSkill.valid && !busy;
  const canSyncAll = anySkills && !busy;

  return (
    <div className="action-panel">
      <div className="group-title">{t("action.selectedGroup")}</div>
      <button
        className="primary"
        disabled={!canSyncSelected}
        onClick={() => selectedSkill && onSyncOne(selectedSkill, "claude")}
      >
        {t("action.syncSelClaude")}
      </button>
      <button
        className="primary"
        disabled={!canSyncSelected}
        onClick={() => selectedSkill && onSyncOne(selectedSkill, "codex")}
      >
        {t("action.syncSelCodex")}
      </button>
      <button disabled={!canSyncSelected} onClick={() => onSyncMany("both", "selected")}>
        {t("action.syncSelBoth")}
      </button>

      <div className="group-title">{t("action.allGroup")}</div>
      <button disabled={!canSyncAll} onClick={() => onSyncMany("claude", "all")}>
        {t("action.syncAllClaude")}
      </button>
      <button disabled={!canSyncAll} onClick={() => onSyncMany("codex", "all")}>
        {t("action.syncAllCodex")}
      </button>
      <button disabled={!canSyncAll} onClick={() => onSyncMany("both", "all")}>
        {t("action.syncAllBoth")}
      </button>

      <div className="group-title">{t("action.unsupportedGroup")}</div>
      <button onClick={() => onUnsupportedSync("Gemini CLI")}>{t("action.syncGemini")}</button>
      <button onClick={() => onUnsupportedSync("OpenCode")}>{t("action.syncOpenCode")}</button>
      <button onClick={() => onUnsupportedSync("Hermes")}>{t("action.syncHermes")}</button>
    </div>
  );
}
