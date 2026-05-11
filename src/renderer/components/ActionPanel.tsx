import type { SkillInfo, ToolName } from "../types";

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
  const canSyncSelected = !!selectedSkill && selectedSkill.valid && !busy;
  const canSyncAll = anySkills && !busy;

  return (
    <div className="action-panel">
      <div className="group-title">Selected skill</div>
      <button
        className="primary"
        disabled={!canSyncSelected}
        onClick={() => selectedSkill && onSyncOne(selectedSkill, "claude")}
      >
        Sync Selected to Claude
      </button>
      <button
        className="primary"
        disabled={!canSyncSelected}
        onClick={() => selectedSkill && onSyncOne(selectedSkill, "codex")}
      >
        Sync Selected to Codex
      </button>
      <button
        disabled={!canSyncSelected}
        onClick={() => onSyncMany("both", "selected")}
      >
        Sync Selected to Both
      </button>

      <div className="group-title">All skills</div>
      <button disabled={!canSyncAll} onClick={() => onSyncMany("claude", "all")}>
        Sync All to Claude
      </button>
      <button disabled={!canSyncAll} onClick={() => onSyncMany("codex", "all")}>
        Sync All to Codex
      </button>
      <button disabled={!canSyncAll} onClick={() => onSyncMany("both", "all")}>
        Sync All to Both
      </button>

      <div className="group-title">Not yet supported</div>
      <button onClick={() => onUnsupportedSync("Gemini CLI")}>Sync to Gemini</button>
      <button onClick={() => onUnsupportedSync("OpenCode")}>Sync to OpenCode</button>
      <button onClick={() => onUnsupportedSync("Hermes")}>Sync to Hermes</button>
    </div>
  );
}
