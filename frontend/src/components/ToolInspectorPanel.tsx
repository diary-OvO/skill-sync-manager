import { useMemo, useState } from "react";
import type { CliSkillEntry, SupportedTool } from "../types";
import { useLanguage } from "../i18n";

interface Props {
  tool: SupportedTool;
  entries: CliSkillEntry[];
  scanning: boolean;
  ignored: Set<string>;
  onUnlink: (entry: CliSkillEntry) => void;
  onImport: (entry: CliSkillEntry, origin: "owned" | "vendored") => void;
  onOpen: (entry: CliSkillEntry) => void;
  onIgnore: (entry: CliSkillEntry) => void;
  onUnignore: (path: string) => void;
}

export function ToolInspectorPanel({
  tool,
  entries,
  scanning,
  ignored,
  onUnlink,
  onImport,
  onOpen,
  onIgnore,
  onUnignore,
}: Props) {
  const { t } = useLanguage();
  const toolLabel = tool === "claude" ? "Claude" : "Codex";
  const [showIgnored, setShowIgnored] = useState(false);

  // 把 external 条目里已经被用户忽略的路径过滤掉；
  // 其他类型（managed / shadowing / stray-link）不应用忽略，因为它们
  // 要么已经在跟踪中，要么是需要用户亲自处理的问题。
  const visible = useMemo(
    () => entries.filter((e) => !(e.kind === "external" && ignored.has(e.path))),
    [entries, ignored],
  );

  // 已忽略清单里，只展示"属于本工具"的条目，避免 Claude / Codex 两个
  // 面板各自显示对方的忽略项。
  const ignoredForThisTool = useMemo(
    () => entries.filter((e) => ignored.has(e.path)),
    [entries, ignored],
  );

  return (
    <div className="panel">
      <div className="panel-header">
        {t("inspector.title")} — {toolLabel}
      </div>
      <div className="panel-body">
        {visible.length === 0 ? (
          <div className="empty">
            {scanning ? "…" : t("inspector.emptyForTool", { tool: toolLabel })}
          </div>
        ) : (
          <div className="inspector-list">
            {visible.map((entry) => (
              <div key={entry.path} className={`inspector-row kind-${entry.kind}`}>
                <div className="inspector-row-head">
                  <span className="inspector-skill-name">{entry.skillName}</span>
                  <span className={`badge inspector-kind-${entry.kind}`}>
                    {t(`inspector.kind.${entry.kind}`)}
                  </span>
                </div>
                <div className="inspector-help">{t(`inspector.kindHelp.${entry.kind}`)}</div>
                <div className="inspector-path" title={entry.path}>
                  {entry.path}
                </div>
                {entry.isLink && entry.linkTarget && (
                  <div className="inspector-link-target">
                    → <span className="mono">{entry.linkTarget}</span>
                  </div>
                )}
                <div className="inspector-actions">
                  {entry.isLink && (
                    <button onClick={() => onUnlink(entry)}>
                      {t("inspector.action.unlink")}
                    </button>
                  )}
                  {entry.kind === "external" && (
                    <>
                      <button className="primary" onClick={() => onImport(entry, "vendored")}>
                        {t("inspector.action.importVendored")}
                      </button>
                      <button onClick={() => onImport(entry, "owned")}>
                        {t("inspector.action.importOwned")}
                      </button>
                      <button
                        className="ghost btn-ignore"
                        onClick={() => onIgnore(entry)}
                        title={t("inspector.action.ignoreTitle")}
                      >
                        {t("inspector.action.ignore")}
                      </button>
                    </>
                  )}
                  <button className="ghost" onClick={() => onOpen(entry)}>
                    {t("inspector.action.open")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 已忽略入口：只有本工具下存在被忽略项时才出现，避免无意义的空抽屉 */}
        {ignoredForThisTool.length > 0 && (
          <div className="inspector-ignored">
            <button
              type="button"
              className="inspector-ignored-toggle"
              onClick={() => setShowIgnored((v) => !v)}
              aria-expanded={showIgnored}
            >
              {showIgnored ? "▾" : "▸"}{" "}
              {t("inspector.ignored.toggle", { count: String(ignoredForThisTool.length) })}
            </button>
            {showIgnored && (
              <div className="inspector-ignored-list">
                {ignoredForThisTool.map((e) => (
                  <div key={e.path} className="inspector-ignored-item">
                    <span className="inspector-ignored-path" title={e.path}>
                      {e.path}
                    </span>
                    <button
                      type="button"
                      className="inspector-ignored-restore"
                      onClick={() => onUnignore(e.path)}
                    >
                      {t("inspector.ignored.restore")}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="ghost inspector-ignored-clear"
                  onClick={() => ignoredForThisTool.forEach((e) => onUnignore(e.path))}
                >
                  {t("inspector.ignored.clearAll")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
