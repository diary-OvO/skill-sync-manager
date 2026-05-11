import type { SkillInfo, SyncState, SyncStatus } from "../types";
import type { SyncStatusMap } from "../App";
import { useLanguage } from "../i18n";

interface Props {
  skills: SkillInfo[];
  syncStatus: SyncStatusMap;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function StatusBadge({ status, unknownLabel }: { status?: SyncStatus; unknownLabel: string }) {
  if (!status) return <span className="badge missing">{unknownLabel}</span>;
  const state: SyncState = status.state;
  return (
    <span className={`badge ${state}`} title={status.message}>
      {state}
    </span>
  );
}

export function SkillTable({ skills, syncStatus, selectedPath, onSelect }: Props) {
  const { t } = useLanguage();
  return (
    <div className="panel skill-table-panel">
      <div className="panel-header">
        {t("table.title")} ({skills.length})
      </div>
      <div className="panel-body padless">
        {skills.length === 0 ? (
          <div className="empty">{t("table.empty")}</div>
        ) : (
          <table className="skill-table">
            <thead>
              <tr>
                <th style={{ width: "18%" }}>{t("table.name")}</th>
                <th>{t("table.description")}</th>
                <th style={{ width: 70 }}>{t("table.valid")}</th>
                <th style={{ width: 110 }}>{t("table.claude")}</th>
                <th style={{ width: 110 }}>{t("table.codex")}</th>
                <th style={{ width: 220 }}>{t("table.path")}</th>
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
                    <td>
                      <strong>{skill.name}</strong>
                    </td>
                    <td>
                      <div
                        style={{
                          maxWidth: 420,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {skill.description || (
                          <span style={{ color: "var(--text-muted)" }}>
                            {t("table.noDescription")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${skill.valid ? "ok" : "invalid"}`}>
                        {skill.valid ? t("git.yes") : t("git.no")}
                      </span>
                    </td>
                    <td>
                      <StatusBadge
                        status={rowStatus?.claude}
                        unknownLabel={t("table.unknown")}
                      />
                    </td>
                    <td>
                      <StatusBadge
                        status={rowStatus?.codex}
                        unknownLabel={t("table.unknown")}
                      />
                    </td>
                    <td className="path" title={skill.path}>
                      {skill.path}
                    </td>
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
