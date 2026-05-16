import type { SkillInfo, ToolName } from "../types";
import type { SyncStatusMap, PendingSet } from "../hooks/useSyncActions";
import { useLanguage } from "../i18n";
import { useColumnResize, type ColumnWidths } from "../hooks/useDragResize";
import { ToolToggleRow } from "./ToolToggleRow";

interface Props {
  skills: SkillInfo[];
  syncStatus: SyncStatusMap;
  pending: PendingSet;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onSync: (skill: SkillInfo, tool: ToolName) => void;
  onUnlink: (skill: SkillInfo, tool: ToolName) => void;
  onToggleGitIgnored: (skill: SkillInfo, gitIgnored: boolean) => void;
  showHidden: boolean;
  onToggleShowHidden: (v: boolean) => void;
}

type ColumnKey = "name" | "description" | "origin" | "git" | "valid" | "tools" | "path";

const DEFAULT_WIDTHS: ColumnWidths = {
  name: 180,
  description: 320,
  origin: 92,
  git: 72,
  valid: 78,
  tools: 200,
  path: 240,
};

const COLUMN_ORDER: ColumnKey[] = [
  "name",
  "description",
  "origin",
  "git",
  "valid",
  "tools",
  "path",
];

export function SkillTable({
  skills,
  syncStatus,
  pending,
  selectedPath,
  onSelect,
  onSync,
  onUnlink,
  onToggleGitIgnored,
  showHidden,
  onToggleShowHidden,
}: Props) {
  const { t } = useLanguage();
  const visible = showHidden ? skills : skills.filter((s) => !s.hidden);
  const hiddenCount = skills.filter((s) => s.hidden).length;

  // v2：列结构由 claude/codex 两列改为 tools 一列，旧的 v1 宽度不兼容，另起一份。
  const { widths, startResize, reset, dragging } = useColumnResize(
    "ssm.skillTable.columnWidths.v2",
    DEFAULT_WIDTHS,
    50,
  );

  const headers: Record<ColumnKey, string> = {
    name: t("table.name"),
    description: t("table.description"),
    origin: t("skill.origin"),
    git: t("table.git"),
    valid: t("table.valid"),
    tools: t("table.tools"),
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
                // 所有列宽之和：表格按列宽汇总决定自身宽度；
                // 当视口比表格更窄时，外层 `.skill-table-scroll` 会出现水平滚动。
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
                  // 选出本行的 pending tool 集合（路径前缀匹配）。
                  const rowPending = new Set<ToolName>();
                  const prefix = `${skill.path}::`;
                  pending.forEach((key) => {
                    if (key.startsWith(prefix)) {
                      rowPending.add(key.slice(prefix.length) as ToolName);
                    }
                  });
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
                      <td className="cell-git">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={!skill.gitIgnored}
                          className={`git-toggle ${skill.gitIgnored ? "git-toggle--ignored" : "git-toggle--tracked"}`}
                          title={
                            skill.gitIgnored
                              ? t("skill.gitIgnoredNote")
                              : t("skill.gitTrackedNote")
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleGitIgnored(skill, !skill.gitIgnored);
                          }}
                        >
                          Git
                        </button>
                      </td>
                      <td className="cell-badge">
                        <span className={`badge ${skill.valid ? "ok" : "invalid"}`}>
                          {skill.valid ? t("git.yes") : t("git.no")}
                        </span>
                      </td>
                      <td className="cell-tools">
                        <ToolToggleRow
                          skill={skill}
                          syncStatus={rowStatus}
                          pending={rowPending}
                          onSync={(s, tool) => onSync(s, tool)}
                          onUnlink={(s, tool, e) => {
                            e.stopPropagation();
                            onUnlink(s, tool);
                          }}
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
