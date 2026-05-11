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
  return (
    <div className="top-bar">
      <span className="label">Shared Skill Root</span>
      <input
        type="text"
        placeholder="e.g. D:\\AgentSkills"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={busy}
      />
      <button onClick={onBrowse} disabled={busy}>
        Browse
      </button>
      <button className="primary" onClick={onScan} disabled={busy || !value}>
        Scan
      </button>
      <button onClick={onImport} disabled={busy || !value}>
        Import Skill Folder
      </button>
      <button onClick={onOpenRoot} disabled={busy || !value} className="ghost">
        Open Shared Root
      </button>
    </div>
  );
}
