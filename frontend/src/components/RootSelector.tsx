import type { KeyboardEvent } from "react";
import { useLanguage } from "../i18n";
import { TOOL_LABEL } from "../assets/toolLogos";
import { SUPPORTED_TOOLS, type SupportedTool } from "../types";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onBrowse: () => void;
  onScan: () => void;
  onImport: () => void;
  onOpenRoot: () => void;
  onRefreshSync: () => void;
  onRescanTool: (tool: SupportedTool) => void;
  onCheckUpdate: () => void;
  onAbout: () => void;
  checkingUpdate: boolean;
  updateBusy: boolean;
  busy: boolean;
}

export function RootSelector(props: Props) {
  const {
    value,
    onChange,
    onBrowse,
    onScan,
    onImport,
    onOpenRoot,
    onRefreshSync,
    onRescanTool,
    onCheckUpdate,
    onAbout,
    checkingUpdate,
    updateBusy,
    busy,
  } = props;
  const { t, lang, setLang } = useLanguage();

  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value && !busy) {
      onScan();
    }
  };

  return (
    <header className="top-bar" aria-label={t("root.toolbarLabel")} aria-busy={busy}>
      <div className="top-bar-primary">
        <div className="top-title-block">
          <span className="app-mark" aria-hidden>
            SS
          </span>
          <div className="top-title-copy">
            <h1 className="top-title">{t("app.title")}</h1>
            <div className="top-subtitle">{t("root.headerHint")}</div>
          </div>
        </div>

        <div className="top-meta-actions">
          <button onClick={onCheckUpdate} disabled={busy || updateBusy} className="ghost">
            {checkingUpdate ? t("update.checking") : t("update.check")}
          </button>
          <button onClick={onAbout} disabled={busy} className="ghost">
            {t("about.open")}
          </button>

          <div className="lang-switch">
            <span className="lang-label">{t("app.language")}</span>
            <div className="lang-buttons" role="group" aria-label={t("app.language")}>
              <button
                type="button"
                className={`lang-btn ${lang === "en" ? "active" : ""}`}
                onClick={() => setLang("en")}
                aria-pressed={lang === "en"}
              >
                EN
              </button>
              <button
                type="button"
                className={`lang-btn ${lang === "zh" ? "active" : ""}`}
                onClick={() => setLang("zh")}
                aria-pressed={lang === "zh"}
              >
                中文
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="root-command-strip">
        <label className="root-field">
          <span className="root-field-label">{t("root.label")}</span>
          <input
            type="text"
            placeholder={t("root.placeholder")}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={submitOnEnter}
            disabled={busy}
          />
        </label>

        <div className="root-primary-actions">
          <button onClick={onBrowse} disabled={busy}>
            {t("root.browse")}
          </button>
          <button className="primary" onClick={onScan} disabled={busy || !value}>
            {busy ? t("scan.overlay.title") : t("root.scan")}
          </button>
        </div>
      </div>

      <div className="command-tray">
        <div className="quick-actions">
          <span className="tray-label">{t("root.quickActions")}</span>
          <button onClick={onRefreshSync} disabled={busy || !value} title={t("root.refreshSync")}>
            {t("root.refreshSync")}
          </button>
          <button onClick={onImport} disabled={busy || !value}>
            {t("root.import")}
          </button>
          <button onClick={onOpenRoot} disabled={busy || !value} className="ghost">
            {t("root.open")}
          </button>
        </div>

        <div className="rescan-cluster" aria-label={t("root.rescanTools")}>
          <span className="tray-label">{t("root.rescanTools")}</span>
          <div className="rescan-buttons">
            {SUPPORTED_TOOLS.map((tool) => (
              <button key={tool} onClick={() => onRescanTool(tool)} disabled={busy || !value}>
                {TOOL_LABEL[tool]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
