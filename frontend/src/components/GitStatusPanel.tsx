import type { GitStatus } from "../types";
import { useLanguage } from "../i18n";

interface Props {
  status: GitStatus | null;
}

export function GitStatusPanel({ status }: Props) {
  const { t } = useLanguage();
  const yesNo = (v: boolean) => (v ? t("git.yes") : t("git.no"));

  return (
    <div className="panel">
      <div className="panel-header">{t("git.title")}</div>
      <div className="panel-body">
        {!status ? (
          <div className="empty">{t("git.none")}</div>
        ) : (
          <>
            <div className="status-line">
              <span className="key">{t("git.available")}</span>
              <span className="value">
                <span className={`badge ${status.gitAvailable ? "ok" : "bad"}`}>
                  {yesNo(status.gitAvailable)}
                </span>
              </span>
            </div>
            <div className="status-line">
              <span className="key">{t("git.repository")}</span>
              <span className="value">
                <span className={`badge ${status.isRepo ? "ok" : "warn"}`}>
                  {yesNo(status.isRepo)}
                </span>
              </span>
            </div>
            <div className="status-line">
              <span className="key">{t("git.branch")}</span>
              <span className="value">{status.branch ?? "—"}</span>
            </div>
            <div className="status-line">
              <span className="key">{t("git.remote")}</span>
              <span className="value">
                <span className={`badge ${status.hasRemote ? "ok" : "warn"}`}>
                  {yesNo(status.hasRemote)}
                </span>
              </span>
            </div>
            <div className="status-line">
              <span className="key">{t("git.dirty")}</span>
              <span className="value">
                <span className={`badge ${status.dirty ? "warn" : "ok"}`}>
                  {yesNo(status.dirty)}
                </span>
              </span>
            </div>
            {status.remotes.length > 0 && (
              <div
                className="status-line"
                style={{ flexDirection: "column", alignItems: "flex-start" }}
              >
                <span className="key" style={{ marginBottom: 4 }}>
                  {t("git.remotes")}
                </span>
                <pre className="inline-code-block">{status.remotes.join("\n")}</pre>
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
