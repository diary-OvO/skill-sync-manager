import { useLanguage } from "../i18n";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onBrowse: () => void;
  onScan: () => void;
  onImport: () => void;
  onOpenRoot: () => void;
  busy: boolean;
}

export function RootSelector(props: Props) {
  const { value, onChange, onBrowse, onScan, onImport, onOpenRoot, busy } = props;
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
      <button onClick={onImport} disabled={busy || !value}>
        {t("root.import")}
      </button>
      <button onClick={onOpenRoot} disabled={busy || !value} className="ghost">
        {t("root.open")}
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
