import type { MouseEvent } from "react";
import { ALL_TOOLS, type SkillInfo, type SyncStatus, type ToolName } from "../types";
import { ToolToggle, resolveToggleState } from "./ToolToggle";

export interface ToolToggleRowProps {
  skill: SkillInfo;
  syncStatus: Partial<Record<ToolName, SyncStatus>> | undefined;
  pending: ReadonlySet<ToolName>;
  onSync: (skill: SkillInfo, tool: ToolName) => void;
  onUnlink: (skill: SkillInfo, tool: ToolName, e: MouseEvent<HTMLButtonElement>) => void;
}

export function ToolToggleRow({
  skill,
  syncStatus,
  pending,
  onSync,
  onUnlink,
}: ToolToggleRowProps) {
  return (
    <div
      className="tool-toggle-row"
      role="group"
      aria-label={`Sync status for ${skill.name}`}
      onClick={(e) => e.stopPropagation()}
    >
      {ALL_TOOLS.map((tool) => {
        const info = resolveToggleState(skill, syncStatus?.[tool], tool);
        return (
          <ToolToggle
            key={tool}
            tool={tool}
            info={info}
            busy={pending.has(tool)}
            onSync={(t) => onSync(skill, t)}
            onUnlink={(t, e) => onUnlink(skill, t, e)}
          />
        );
      })}
    </div>
  );
}
