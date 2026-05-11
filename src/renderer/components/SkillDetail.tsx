import type { SkillInfo, SyncStatus, ToolName } from "../types";

interface Props {
  skill: SkillInfo | null;
  syncStatus?: Partial<Record<ToolName, SyncStatus>>;
}

export function SkillDetail({ skill, syncStatus }: Props) {
  if (!skill) {
    return <div className="empty">Select a skill to see details.</div>;
  }

  const claudeTarget = syncStatus?.claude?.targetPath ?? "—";
  const codexTarget = syncStatus?.codex?.targetPath ?? "—";
  const fmEntries = Object.entries(skill.frontmatter);

  return (
    <div className="skill-detail">
      <div>
        <div className="label">Name</div>
        <div><strong>{skill.name}</strong></div>
      </div>
      <div>
        <div className="label">Valid</div>
        <div>
          <span className={`badge ${skill.valid ? "ok" : "invalid"}`}>
            {skill.valid ? "yes" : "no"}
          </span>
        </div>
      </div>

      <div className="full">
        <div className="label">Description</div>
        <div>{skill.description || <span style={{ color: "var(--text-muted)" }}>(none)</span>}</div>
      </div>

      <div className="full">
        <div className="label">Skill path</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, wordBreak: "break-all" }}>
          {skill.path}
        </div>
      </div>

      <div>
        <div className="label">Claude target</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, wordBreak: "break-all" }}>
          {claudeTarget}
        </div>
      </div>
      <div>
        <div className="label">Codex target</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, wordBreak: "break-all" }}>
          {codexTarget}
        </div>
      </div>

      {skill.errors.length > 0 && (
        <div className="full">
          <div className="label">Notes / Errors</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--red)" }}>
            {skill.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="full">
        <div className="label">Frontmatter</div>
        {fmEntries.length === 0 ? (
          <div className="empty">(empty)</div>
        ) : (
          <pre>
            {fmEntries.map(([k, v]) => `${k}: ${v}`).join("\n")}
          </pre>
        )}
      </div>

      <div className="full">
        <div className="label">Body preview</div>
        {skill.bodyPreview ? (
          <pre>{skill.bodyPreview}</pre>
        ) : (
          <div className="empty">(empty)</div>
        )}
      </div>
    </div>
  );
}
