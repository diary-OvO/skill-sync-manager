import type { GitStatus } from "../types";

interface Props {
  status: GitStatus | null;
}

function yesNo(v: boolean): string {
  return v ? "yes" : "no";
}

export function GitStatusPanel({ status }: Props) {
  return (
    <div className="panel">
      <div className="panel-header">Git Status</div>
      <div className="panel-body">
        {!status ? (
          <div className="empty">No status yet.</div>
        ) : (
          <>
            <div className="status-line">
              <span className="key">Git available</span>
              <span className="value">
                <span className={`badge ${status.gitAvailable ? "ok" : "bad"}`}>
                  {yesNo(status.gitAvailable)}
                </span>
              </span>
            </div>
            <div className="status-line">
              <span className="key">Repository</span>
              <span className="value">
                <span className={`badge ${status.isRepo ? "ok" : "warn"}`}>
                  {yesNo(status.isRepo)}
                </span>
              </span>
            </div>
            <div className="status-line">
              <span className="key">Branch</span>
              <span className="value">{status.branch ?? "—"}</span>
            </div>
            <div className="status-line">
              <span className="key">Remote configured</span>
              <span className="value">
                <span className={`badge ${status.hasRemote ? "ok" : "warn"}`}>
                  {yesNo(status.hasRemote)}
                </span>
              </span>
            </div>
            <div className="status-line">
              <span className="key">Dirty</span>
              <span className="value">
                <span className={`badge ${status.dirty ? "warn" : "ok"}`}>
                  {yesNo(status.dirty)}
                </span>
              </span>
            </div>
            {status.remotes.length > 0 && (
              <div className="status-line" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                <span className="key" style={{ marginBottom: 4 }}>Remotes</span>
                <pre style={{
                  margin: 0,
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  background: "#f4f6f8",
                  border: "1px solid var(--panel-border)",
                  borderRadius: 6,
                  padding: "6px 8px",
                  width: "100%",
                }}>
                  {status.remotes.join("\n")}
                </pre>
              </div>
            )}
            {status.error && (
              <div className="status-line" style={{ color: "var(--red)" }}>
                {status.error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
