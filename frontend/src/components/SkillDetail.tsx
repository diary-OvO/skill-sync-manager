import type { SkillInfo, SkillOrigin, SyncStatus, ToolName } from "../types";
import { useLanguage } from "../i18n";

interface Props {
  skill: SkillInfo | null;
  syncStatus?: Partial<Record<ToolName, SyncStatus>>;
  onChangeMetadata: (
    skill: SkillInfo,
    patch: { hidden?: boolean; frozen?: boolean; origin?: SkillOrigin },
  ) => void;
}

export function SkillDetail({ skill, syncStatus, onChangeMetadata }: Props) {
  const { t } = useLanguage();

  if (!skill) {
    return <div className="empty">{t("detail.empty")}</div>;
  }

  const claudeTarget = syncStatus?.claude?.targetPath ?? "—";
  const codexTarget = syncStatus?.codex?.targetPath ?? "—";
  const fmEntries = Object.entries(skill.frontmatter ?? {});
  const origin: SkillOrigin = (skill.origin as SkillOrigin) || "owned";

  return (
    <div className="skill-detail">
      <div>
        <div className="label">{t("detail.name")}</div>
        <div>
          <strong>{skill.name}</strong>
        </div>
      </div>
      <div>
        <div className="label">{t("detail.valid")}</div>
        <div>
          <span className={`badge ${skill.valid ? "ok" : "invalid"}`}>
            {skill.valid ? t("git.yes") : t("git.no")}
          </span>
        </div>
      </div>

      <div>
        <div className="label">{t("skill.origin")}</div>
        <div className="metadata-origin">
          <select
            value={origin}
            onChange={(e) => onChangeMetadata(skill, { origin: e.target.value as SkillOrigin })}
          >
            <option value="owned">{t("origin.owned")}</option>
            <option value="vendored">{t("origin.vendored")}</option>
          </select>
        </div>
      </div>

      <div>
        <div className="label">{t("skill.hidden")} / {t("skill.frozen")}</div>
        <div className="metadata-toggles">
          <label className="toggle">
            <input
              type="checkbox"
              checked={skill.hidden}
              onChange={(e) => onChangeMetadata(skill, { hidden: e.target.checked })}
            />
            <span>{t("skill.hidden")}</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={skill.frozen}
              onChange={(e) => onChangeMetadata(skill, { frozen: e.target.checked })}
            />
            <span>{t("skill.frozen")}</span>
          </label>
        </div>
      </div>

      <div className="full">
        <div className="label">{t("detail.description")}</div>
        <div>
          {skill.description || (
            <span style={{ color: "var(--text-muted)" }}>{t("detail.empty_value")}</span>
          )}
        </div>
      </div>

      <div className="full">
        <div className="label">{t("detail.skillPath")}</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, wordBreak: "break-all" }}>
          {skill.path}
        </div>
      </div>

      <div>
        <div className="label">{t("detail.claudeTarget")}</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, wordBreak: "break-all" }}>
          {claudeTarget}
        </div>
      </div>
      <div>
        <div className="label">{t("detail.codexTarget")}</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, wordBreak: "break-all" }}>
          {codexTarget}
        </div>
      </div>

      {skill.frozen && (
        <div className="full">
          <div className="banner banner-info">{t("skill.frozenNote")}</div>
        </div>
      )}
      {skill.hidden && (
        <div className="full">
          <div className="banner banner-info">{t("skill.hiddenNote")}</div>
        </div>
      )}

      {skill.errors && skill.errors.length > 0 && (
        <div className="full">
          <div className="label">{t("detail.notes")}</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--red)" }}>
            {skill.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="full">
        <div className="label">{t("detail.frontmatter")}</div>
        {fmEntries.length === 0 ? (
          <div className="empty">{t("detail.emptyList")}</div>
        ) : (
          <pre>{fmEntries.map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
        )}
      </div>

      <div className="full">
        <div className="label">{t("detail.bodyPreview")}</div>
        {skill.bodyPreview ? (
          <pre>{skill.bodyPreview}</pre>
        ) : (
          <div className="empty">{t("detail.emptyList")}</div>
        )}
      </div>
    </div>
  );
}
