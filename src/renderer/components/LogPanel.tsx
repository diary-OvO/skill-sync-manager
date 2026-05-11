import { useEffect, useRef } from "react";
import type { LogEntry } from "../types";

interface Props {
  entries: LogEntry[];
}

export function LogPanel({ entries }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length]);

  return (
    <div className="panel" style={{ maxHeight: 180 }}>
      <div className="panel-header">Logs</div>
      <div className="panel-body log-panel">
        {entries.length === 0 ? (
          <div className="empty">No activity yet.</div>
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
