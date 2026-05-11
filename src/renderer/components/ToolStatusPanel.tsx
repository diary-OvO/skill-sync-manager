import type { ToolStatus } from "../types";

interface Props {
  tools: ToolStatus[];
}

export function ToolStatusPanel({ tools }: Props) {
  return (
    <div className="panel">
      <div className="panel-header">CLI Tools</div>
      <div className="panel-body">
        {tools.length === 0 ? (
          <div className="empty">Detecting…</div>
        ) : (
          tools.map((t) => (
            <div key={t.toolName} className="tool-row">
              <div>
                <span className="tool-name">{t.toolName}</span>{" "}
                <span className={`badge ${t.detected ? "ok" : "warn"}`}>
                  {t.detected ? "detected" : "missing"}
                </span>{" "}
                <span className={`badge ${t.supported ? "ok" : "unsupported"}`}>
                  {t.supported ? "supported" : "unsupported"}
                </span>
              </div>
              <div className="tool-path" title={t.executablePath ?? ""}>
                {t.executablePath ?? "—"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
