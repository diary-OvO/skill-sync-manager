import { useEffect } from "react";
import { useLanguage } from "../i18n";
import type { AppInfo } from "../types";

interface Props {
  open: boolean;
  info: AppInfo | null;
  loading: boolean;
  onClose: () => void;
  onOpenRelease: () => void;
  onCheckUpdate: () => void;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="about-field">
      <div className="about-field-label">{label}</div>
      <div className="about-field-value" title={value}>
        {value || "—"}
      </div>
    </div>
  );
}

export function AboutDialog({
  open,
  info,
  loading,
  onClose,
  onOpenRelease,
  onCheckUpdate,
}: Props) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="about-overlay" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <div className="about-card">
        <button
          type="button"
          className="about-close"
          onClick={onClose}
          aria-label={t("about.close")}
          title={t("about.close")}
        >
          ×
        </button>
        <div className="about-title" id="about-title">
          {t("about.title")}
        </div>
        <div className="about-subtitle">
          {loading ? t("about.loading") : t("about.version", { version: info?.version ?? "—" })}
        </div>
        <div className="about-fields">
          <Field label={t("about.appName")} value={info?.appName ?? ""} />
          <Field label={t("about.repository")} value={info ? `${info.repoOwner}/${info.repoName}` : ""} />
          <Field label={t("about.release")} value={info?.releaseUrl ?? ""} />
          <Field label={t("about.executable")} value={info?.executablePath ?? ""} />
        </div>
        <div className="about-actions">
          <button type="button" className="primary" onClick={onCheckUpdate}>
            {t("update.check")}
          </button>
          <button type="button" onClick={onOpenRelease} disabled={!info?.releaseUrl}>
            {t("update.openRelease")}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            {t("about.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
