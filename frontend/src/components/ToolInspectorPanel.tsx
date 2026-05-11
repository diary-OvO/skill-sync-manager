import type { CliSkillEntry, SupportedTool } from "../types";
import { useLanguage } from "../i18n";

interface Props {
  tool: SupportedTool;
  entries: CliSkillEntry[];
  scanning: boolean;
  onUnlink: (entry: CliSkillEntry) => void;
  onImport: (entry: CliSkillEntry, origin: "owned" | "vendored") => void;
  onOpen: (entry: CliSkillEntry) => void;
}

export function ToolInspectorPanel({
  tool,
  entries,
  scanning,
  onUnlink,
  onImport,
  onOpen,
}: Props) {
  const { t } = useLanguage();
  const toolLabel = tool === "claude" ? "Claude" : "Codex";

  return (
    <div className="panel">
      <div className="panel-header">
        {t("inspector.title")} — {toolLabel}
      </div>
      <div className="panel-body">
        {entries.length === 0 ? (
          <div className="empty">
            {scanning ? "…" : t("inspector.emptyForTool", { tool: toolLabel })}
          </div>
        ) : (
          <div className="inspector-list">
            {entries.map((entry) => (
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
      </div>
    </div>
  );
}
