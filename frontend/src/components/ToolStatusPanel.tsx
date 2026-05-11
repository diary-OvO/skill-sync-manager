import type { ToolStatus } from "../types";
import { useLanguage } from "../i18n";

interface Props {
  tools: ToolStatus[];
}

export function ToolStatusPanel({ tools }: Props) {
  const { t } = useLanguage();
  return (
    <div className="panel">
      <div className="panel-header">{t("tools.title")}</div>
      <div className="panel-body">
        {tools.length === 0 ? (
          <div className="empty">{t("tools.detecting")}</div>
        ) : (
          <div className="tool-list">
            {tools.map((tool) => (
              <div key={tool.toolName} className="tool-row">
                <div className="tool-row-head">
                  <span className="tool-name">{tool.toolName}</span>
                  <span className={`badge ${tool.detected ? "ok" : "warn"}`}>
                    {tool.detected ? t("tools.detected") : t("tools.missing")}
                  </span>
                  <span className={`badge ${tool.supported ? "ok" : "unsupported"}`}>
                    {tool.supported ? t("tools.supported") : t("tools.unsupported")}
                  </span>
                </div>
                <div className="tool-row-path" title={tool.executablePath ?? ""}>
                  <span className="tool-row-path-label">{t("tools.path")}</span>
                  <span className="tool-row-path-value">{tool.executablePath ?? "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
