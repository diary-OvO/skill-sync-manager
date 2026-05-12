import type { ReactNode } from "react";
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

// 单行详情项：`label + 内容`，full 表示占满整行。
function Field({
  label,
  full = false,
  children,
}: {
  label: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={full ? "full" : undefined}>
      <div className="label">{label}</div>
      <div>{children}</div>
    </div>
  );
}

// 等宽、可断行的路径单元，供 skillPath / claudeTarget / codexTarget 复用。
const monoPathStyle: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 12,
  wordBreak: "break-all",
};

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
      <Field label={t("detail.name")}>
        <strong>{skill.name}</strong>
      </Field>

      <Field label={t("detail.valid")}>
        <span className={`badge ${skill.valid ? "ok" : "invalid"}`}>
          {skill.valid ? t("git.yes") : t("git.no")}
        </span>
      </Field>

      <Field label={t("skill.origin")}>
        <div className="metadata-origin">
          <select
            value={origin}
            onChange={(e) =>
              onChangeMetadata(skill, { origin: e.target.value as SkillOrigin })
            }
          >
            <option value="owned">{t("origin.owned")}</option>
            <option value="vendored">{t("origin.vendored")}</option>
          </select>
        </div>
      </Field>

      <Field label={`${t("skill.hidden")} / ${t("skill.frozen")}`}>
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
      </Field>

      <Field label={t("detail.description")} full>
        {skill.description || (
          <span style={{ color: "var(--text-muted)" }}>{t("detail.empty_value")}</span>
        )}
      </Field>

      <Field label={t("detail.skillPath")} full>
        <div style={monoPathStyle}>{skill.path}</div>
      </Field>

      <Field label={t("detail.claudeTarget")}>
        <div style={monoPathStyle}>{claudeTarget}</div>
      </Field>
      <Field label={t("detail.codexTarget")}>
        <div style={monoPathStyle}>{codexTarget}</div>
      </Field>

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
        <Field label={t("detail.notes")} full>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--red)" }}>
            {skill.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Field>
      )}

      <Field label={t("detail.frontmatter")} full>
        {fmEntries.length === 0 ? (
          <div className="empty">{t("detail.emptyList")}</div>
        ) : (
          <pre>{fmEntries.map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
        )}
      </Field>

      <Field label={t("detail.bodyPreview")} full>
        {skill.bodyPreview ? (
          <pre>{skill.bodyPreview}</pre>
        ) : (
          <div className="empty">{t("detail.emptyList")}</div>
        )}
      </Field>
    </div>
  );
}
