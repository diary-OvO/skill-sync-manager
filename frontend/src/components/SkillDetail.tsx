import type { SkillInfo, SyncStatus, ToolName } from "../types";
import { useLanguage } from "../i18n";

interface Props {
  skill: SkillInfo | null;
  syncStatus?: Partial<Record<ToolName, SyncStatus>>;
}

export function SkillDetail({ skill, syncStatus }: Props) {
  const { t } = useLanguage();

  if (!skill) {
    return <div className="empty">{t("detail.empty")}</div>;
  }

  const claudeTarget = syncStatus?.claude?.targetPath ?? "—";
  const codexTarget = syncStatus?.codex?.targetPath ?? "—";
  const fmEntries = Object.entries(skill.frontmatter ?? {});

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
