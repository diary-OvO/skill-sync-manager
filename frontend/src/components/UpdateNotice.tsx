import { useLanguage } from "../i18n";
import type { UpdateInfo } from "../types";

interface Props {
  info: UpdateInfo | null;
  installing: boolean;
  onInstall: () => void;
  onOpenRelease: () => void;
  onDismiss: () => void;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function firstReleaseNoteLine(notes: string): string {
  const line = notes
    .split(/\r?\n/)
    .map((v) => v.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  if (!line) return "";
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

export function UpdateNotice({
  info,
  installing,
  onInstall,
  onOpenRelease,
  onDismiss,
}: Props) {
  const { t } = useLanguage();
  if (!info?.updateAvailable) return null;

  const size = formatBytes(info.assetSize);
  const meta = [info.assetName, size].filter(Boolean).join(" · ");
  const note = firstReleaseNoteLine(info.releaseNotes ?? "");
  const unavailable = info.assetUrl
    ? t("update.autoInstallUnavailable")
    : t("update.noCompatibleAsset");

  return (
    <div className="update-notice" role="status">
      <div className="update-notice-main">
        <div className="update-notice-title">
          {t("update.available", { version: info.latestVersion })}
        </div>
        <div className="update-notice-meta">
          {meta || info.message || t("update.noCompatibleAsset")}
        </div>
        {note ? <div className="update-notice-note">{note}</div> : null}
      </div>
      <div className="update-notice-actions">
        {info.canInstall ? (
          <button className="primary" onClick={onInstall} disabled={installing}>
            {installing ? t("update.installing") : t("update.install")}
          </button>
        ) : (
          <span className="update-notice-disabled">{unavailable}</span>
        )}
        {info.releaseUrl ? (
          <button className="ghost" onClick={onOpenRelease} disabled={installing}>
            {t("update.openRelease")}
          </button>
        ) : null}
        <button className="ghost" onClick={onDismiss} disabled={installing}>
          {t("update.dismiss")}
        </button>
      </div>
    </div>
  );
}
