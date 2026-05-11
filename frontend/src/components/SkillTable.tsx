import type { SkillInfo, SyncState, SyncStatus } from "../types";
import type { SyncStatusMap } from "../App";
import { useLanguage } from "../i18n";
import { useColumnResize, type ColumnWidths } from "../hooks/useDragResize";

interface Props {
  skills: SkillInfo[];
  syncStatus: SyncStatusMap;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  showHidden: boolean;
  onToggleShowHidden: (v: boolean) => void;
}

type ColumnKey = "name" | "description" | "origin" | "valid" | "claude" | "codex" | "path";

const DEFAULT_WIDTHS: ColumnWidths = {
  name: 180,
  description: 320,
  origin: 92,
  valid: 78,
  claude: 118,
  codex: 118,
  path: 240,
};

const COLUMN_ORDER: ColumnKey[] = [
  "name",
  "description",
  "origin",
  "valid",
  "claude",
  "codex",
  "path",
];

function StatusBadge({ status, unknownLabel }: { status?: SyncStatus; unknownLabel: string }) {
  if (!status) return <span className="badge missing">{unknownLabel}</span>;
  const state: SyncState = status.state;
  return (
    <span className={`badge ${state}`} title={status.message}>
      {state}
    </span>
  );
}

export function SkillTable({
  skills,
  syncStatus,
  selectedPath,
  onSelect,
  showHidden,
  onToggleShowHidden,
}: Props) {
  const { t } = useLanguage();
  const visible = showHidden ? skills : skills.filter((s) => !s.hidden);
  const hiddenCount = skills.filter((s) => s.hidden).length;

  const { widths, startResize, reset, dragging } = useColumnResize(
    "ssm.skillTable.columnWidths.v1",
    DEFAULT_WIDTHS,
    50,
  );

  const headers: Record<ColumnKey, string> = {
    name: t("table.name"),
    description: t("table.description"),
    origin: t("skill.origin"),
    valid: t("table.valid"),
    claude: t("table.claude"),
    codex: t("table.codex"),
    path: t("table.path"),
  };

  return (
    <div className="panel skill-table-panel">
      <div className="panel-header">
        <span>
          {t("table.title")} ({visible.length}
          {hiddenCount > 0 ? ` / ${skills.length}` : ""})
        </span>
        <div className="panel-header-actions">
          <label className="show-hidden-toggle">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => onToggleShowHidden(e.target.checked)}
            />
            <span>{t("skill.showHidden")}</span>
          </label>
          <button
            type="button"
            className="ghost reset-widths"
            onClick={reset}
            title={t("table.resetColumns")}
          >
            {t("table.resetColumns")}
          </button>
        </div>
      </div>
      <div className="panel-body padless">
        {visible.length === 0 ? (
          <div className="empty">{t("table.empty")}</div>
        ) : (
          <div className={`skill-table-scroll ${dragging ? "col-resizing" : ""}`}>
            <table
              className="skill-table"
              style={{
                tableLayout: "fixed",
                // Sum of column widths — anchors the table at its natural
                // total but lets the outer `.skill-table-scroll` scroll
                // horizontally when the viewport is narrower.
                width: COLUMN_ORDER.reduce((sum, k) => sum + (widths[k] ?? 0), 0),
                minWidth: "100%",
              }}
            >
              <colgroup>
                {COLUMN_ORDER.map((col) => (
                  <col key={col} style={{ width: widths[col] }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {COLUMN_ORDER.map((col) => (
                    <th key={col}>
                      <span className="th-label">{headers[col]}</span>
                      <span
                        className="col-resizer"
                        onMouseDown={startResize(col)}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${headers[col]}`}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((skill) => {
                  const rowStatus = syncStatus[skill.path];
                  const originKey = skill.origin || "owned";
                  return (
                    <tr
                      key={skill.path}
                      className={`${selectedPath === skill.path ? "selected" : ""} ${skill.hidden ? "hidden-row" : ""} ${skill.frozen ? "frozen-row" : ""}`}
                      onClick={() => onSelect(skill.path)}
                    >
                      <td className="cell-name">
                        <div className="name-cell">
                          <strong className="clamp-1">{skill.name}</strong>
                          {skill.frozen && (
                            <span className="badge frozen-pill" title={t("skill.frozenNote")}>
                              ❄
                            </span>
                          )}
                          {skill.hidden && (
                            <span className="badge hidden-pill" title={t("skill.hiddenNote")}>
                              ·
                            </span>
                          )}
                        </div>
                      </td>
                      <td title={skill.description}>
                        <div className="clamp-2">
                          {skill.description || (
                            <span style={{ color: "var(--text-muted)" }}>
                              {t("table.noDescription")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="cell-badge">
                        <span className={`badge origin-${originKey}`}>
                          {t(`origin.${originKey}`)}
                        </span>
                      </td>
                      <td className="cell-badge">
                        <span className={`badge ${skill.valid ? "ok" : "invalid"}`}>
                          {skill.valid ? t("git.yes") : t("git.no")}
                        </span>
                      </td>
                      <td className="cell-badge">
                        <StatusBadge
                          status={rowStatus?.claude}
                          unknownLabel={t("table.unknown")}
                        />
                      </td>
                      <td className="cell-badge">
                        <StatusBadge
                          status={rowStatus?.codex}
                          unknownLabel={t("table.unknown")}
                        />
                      </td>
                      <td className="path" title={skill.path}>
                        <div className="clamp-2">{skill.path}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
