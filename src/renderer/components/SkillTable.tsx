import type { SkillInfo, SyncState, SyncStatus } from "../types";
import type { SyncStatusMap } from "../App";

interface Props {
  skills: SkillInfo[];
  syncStatus: SyncStatusMap;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function StatusBadge({ status }: { status?: SyncStatus }) {
  if (!status) return <span className="badge missing">unknown</span>;
  const state: SyncState = status.state;
  return (
    <span className={`badge ${state}`} title={status.message}>
      {state}
    </span>
  );
}

export function SkillTable({ skills, syncStatus, selectedPath, onSelect }: Props) {
  return (
    <div className="panel">
      <div className="panel-header">Skills ({skills.length})</div>
      <div className="panel-body padless">
        {skills.length === 0 ? (
          <div className="empty">No skills found. Select a shared root and Scan.</div>
        ) : (
          <table className="skill-table">
            <thead>
              <tr>
                <th style={{ width: "18%" }}>Name</th>
                <th>Description</th>
                <th style={{ width: 70 }}>Valid</th>
                <th style={{ width: 110 }}>Claude</th>
                <th style={{ width: 110 }}>Codex</th>
                <th style={{ width: 220 }}>Path</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((skill) => {
                const rowStatus = syncStatus[skill.path];
                return (
                  <tr
                    key={skill.path}
                    className={selectedPath === skill.path ? "selected" : ""}
                    onClick={() => onSelect(skill.path)}
                  >
                    <td><strong>{skill.name}</strong></td>
                    <td>
                      <div style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {skill.description || <span style={{ color: "var(--text-muted)" }}>(no description)</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${skill.valid ? "ok" : "invalid"}`}>
                        {skill.valid ? "yes" : "no"}
                      </span>
                    </td>
                    <td><StatusBadge status={rowStatus?.claude} /></td>
                    <td><StatusBadge status={rowStatus?.codex} /></td>
                    <td className="path" title={skill.path}>{skill.path}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
