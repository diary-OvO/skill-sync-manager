import type { GitStatus } from "../types";
import { useLanguage } from "../i18n";

interface Props {
  status: GitStatus | null;
}

// 单行"键 : 是/否 徽章"的小组件，统一 GitStatusPanel 中的重复结构。
function BoolRow({
  label,
  value,
  goodWhen = true,
  yes,
  no,
}: {
  label: string;
  value: boolean;
  /** value 等于该布尔时显示绿色徽章（ok），否则依据上下文使用 warn / bad。 */
  goodWhen?: boolean;
  yes: string;
  no: string;
}) {
  const isGood = value === goodWhen;
  const cls = isGood ? "ok" : goodWhen ? "warn" : "bad";
  return (
    <div className="status-line">
      <span className="key">{label}</span>
      <span className="value">
        <span className={`badge ${cls}`}>{value ? yes : no}</span>
      </span>
    </div>
  );
}

export function GitStatusPanel({ status }: Props) {
  const { t } = useLanguage();
  const yes = t("git.yes");
  const no = t("git.no");

  return (
    <div className="panel">
      <div className="panel-header">{t("git.title")}</div>
      <div className="panel-body">
        {!status ? (
          <div className="empty">{t("git.none")}</div>
        ) : (
          <>
            {/* gitAvailable: false 时用红色 bad 徽章 */}
            <div className="status-line">
              <span className="key">{t("git.available")}</span>
              <span className="value">
                <span className={`badge ${status.gitAvailable ? "ok" : "bad"}`}>
                  {status.gitAvailable ? yes : no}
                </span>
              </span>
            </div>
            <BoolRow label={t("git.repository")} value={status.isRepo} yes={yes} no={no} />
            <div className="status-line">
              <span className="key">{t("git.branch")}</span>
              <span className="value">{status.branch ?? "—"}</span>
            </div>
            <BoolRow label={t("git.remote")} value={status.hasRemote} yes={yes} no={no} />
            {/* dirty 为 true 才是不利状态，所以 goodWhen 传 false */}
            <BoolRow
              label={t("git.dirty")}
              value={status.dirty}
              goodWhen={false}
              yes={yes}
              no={no}
            />
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
