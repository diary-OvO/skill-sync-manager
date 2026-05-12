import { useEffect, useRef } from "react";
import type { LogEntry } from "../types";
import { useLanguage } from "../i18n";

interface Props {
  entries: LogEntry[];
  onClear: () => void;
}

export function LogPanel({ entries, onClear }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length]);

  return (
    <div className="panel" style={{ maxHeight: 180 }}>
      <div className="panel-header log-panel-header">
        <span>{t("log.title")}</span>
        <span className="log-panel-meta">
          <span className="log-panel-count">
            {t("log.count", { count: String(entries.length) })}
          </span>
          <button
            type="button"
            className="ghost log-panel-clear"
            onClick={onClear}
            disabled={entries.length === 0}
          >
            {t("log.clear")}
          </button>
        </span>
      </div>
      <div className="panel-body log-panel">
        {entries.length === 0 ? (
          <div className="empty">{t("log.empty")}</div>
        ) : (
          entries.map((e, i) => (
            <div key={i} className={`log-entry ${e.result}`}>
              [{e.timestamp}] {e.action}: {e.message}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
