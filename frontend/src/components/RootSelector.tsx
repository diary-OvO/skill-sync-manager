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
    checkingUpdate,
    updateBusy,
    busy,
  } = props;
  const { t, lang, setLang } = useLanguage();

  return (
    <div className="top-bar">
      <span className="label">{t("root.label")}</span>
      <input
        type="text"
        placeholder={t("root.placeholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={busy}
      />
      <button onClick={onBrowse} disabled={busy}>
        {t("root.browse")}
      </button>
      <button className="primary" onClick={onScan} disabled={busy || !value}>
        {t("root.scan")}
      </button>
      <button onClick={onRefreshSync} disabled={busy || !value} title={t("root.refreshSync")}>
        {t("root.refreshSync")}
      </button>
      <span className="top-bar-sep" />
      {SUPPORTED_TOOLS.map((tool) => (
        <button key={tool} onClick={() => onRescanTool(tool)} disabled={busy || !value}>
          {t("root.rescanTool", { tool: TOOL_LABEL[tool] })}
        </button>
      ))}
      <span className="top-bar-sep" />
      <button onClick={onImport} disabled={busy || !value}>
        {t("root.import")}
      </button>
      <button onClick={onOpenRoot} disabled={busy || !value} className="ghost">
        {t("root.open")}
      </button>
      <button onClick={onCheckUpdate} disabled={busy || updateBusy} className="ghost">
        {checkingUpdate ? t("update.checking") : t("update.check")}
      </button>

      <div className="lang-switch">
        <span className="lang-label">{t("app.language")}</span>
        <div className="lang-buttons" role="group">
          <button
            type="button"
            className={`lang-btn ${lang === "en" ? "active" : ""}`}
            onClick={() => setLang("en")}
          >
            EN
          </button>
          <button
            type="button"
            className={`lang-btn ${lang === "zh" ? "active" : ""}`}
            onClick={() => setLang("zh")}
          >
            中文
          </button>
        </div>
      </div>
    </div>
  );
}
