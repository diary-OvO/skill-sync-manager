import { useEffect, useRef } from "react";
import type { LogEntry } from "../types";
import { useLanguage } from "../i18n";

interface Props {
  entries: LogEntry[];
}

export function LogPanel({ entries }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length]);

  return (
    <div className="panel" style={{ maxHeight: 180 }}>
      <div className="panel-header">{t("log.title")}</div>
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
