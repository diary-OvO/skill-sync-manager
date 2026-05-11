import { useState } from "react";
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
  const [unsupportedOpen, setUnsupportedOpen] = useState(false);

  return (
    <div className="action-panel">
      <section className="action-section">
        <header className="action-section-header">{t("action.selectedGroup")}</header>
        <div className="action-row action-row-split">
          <button
            className="primary compact"
            disabled={!canSyncSelected}
            onClick={() => selectedSkill && onSyncOne(selectedSkill, "claude")}
          >
            {t("action.syncSelClaude")}
          </button>
          <button
            className="primary compact"
            disabled={!canSyncSelected}
            onClick={() => selectedSkill && onSyncOne(selectedSkill, "codex")}
          >
            {t("action.syncSelCodex")}
          </button>
        </div>
        <button
          className="compact subtle"
          disabled={!canSyncSelected}
          onClick={() => onSyncMany("both", "selected")}
        >
          {t("action.syncSelBoth")}
        </button>
      </section>

      <section className="action-section">
        <header className="action-section-header">{t("action.allGroup")}</header>
        <div className="action-row action-row-split">
          <button
            className="compact"
            disabled={!canSyncAll}
            onClick={() => onSyncMany("claude", "all")}
          >
            {t("action.syncAllClaude")}
          </button>
          <button
            className="compact"
            disabled={!canSyncAll}
            onClick={() => onSyncMany("codex", "all")}
          >
            {t("action.syncAllCodex")}
          </button>
        </div>
        <button
          className="compact subtle"
          disabled={!canSyncAll}
          onClick={() => onSyncMany("both", "all")}
        >
          {t("action.syncAllBoth")}
        </button>
      </section>

      <section className={`action-section collapsible ${unsupportedOpen ? "open" : ""}`}>
        <button
          type="button"
          className="action-section-toggle"
          onClick={() => setUnsupportedOpen((v) => !v)}
          aria-expanded={unsupportedOpen}
        >
          <span className="chevron" aria-hidden>
            ▸
          </span>
          <span>{t("action.unsupportedGroup")}</span>
        </button>
        {unsupportedOpen && (
          <div className="action-col">
            <button className="compact subtle" onClick={() => onUnsupportedSync("Gemini CLI")}>
              {t("action.syncGemini")}
            </button>
            <button className="compact subtle" onClick={() => onUnsupportedSync("OpenCode")}>
              {t("action.syncOpenCode")}
            </button>
            <button className="compact subtle" onClick={() => onUnsupportedSync("Hermes")}>
              {t("action.syncHermes")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
