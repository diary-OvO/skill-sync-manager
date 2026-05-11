import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Lang = "en" | "zh";

type MessageTree = { [k: string]: string | MessageTree };

const messages: Record<Lang, MessageTree> = {
  en: {
    app: {
      title: "Skill Sync Manager",
      language: "Language",
      platformWarning:
        "Current version only supports Windows directory junction sync. The UI still loads, but sync actions will report errors on other platforms.",
    },
    root: {
      label: "Shared Skill Root",
      placeholder: "e.g. D:\\AgentSkills",
      browse: "Browse",
      scan: "Scan",
      import: "Import Skill Folder",
      open: "Open Shared Root",
      noRootAlert: "Please select a shared skill root first.",
      refreshSync: "Refresh Sync",
      rescanClaude: "Rescan Claude",
      rescanCodex: "Rescan Codex",
    },
    git: {
      title: "Git Status",
      none: "No status yet.",
      available: "Git available",
      repository: "Repository",
      branch: "Branch",
      remote: "Remote configured",
      dirty: "Dirty",
      remotes: "Remotes",
      yes: "yes",
      no: "no",
    },
    tools: {
      title: "CLI Tools",
      detecting: "Detecting…",
      detected: "detected",
      missing: "missing",
      supported: "supported",
      unsupported: "unsupported",
      path: "Path",
    },
    table: {
      title: "Skills",
      empty: "No skills found. Select a shared root and Scan.",
      name: "Name",
      description: "Description",
      valid: "Valid",
      claude: "Claude",
      codex: "Codex",
      path: "Path",
      noDescription: "(no description)",
      unknown: "unknown",
      resetColumns: "Reset columns",
    },
    split: {
      resize: "Drag to resize",
    },
    detail: {
      empty: "Select a skill to see details.",
      header: "Selected Skill",
      name: "Name",
      valid: "Valid",
      description: "Description",
      skillPath: "Skill path",
      claudeTarget: "Claude target",
      codexTarget: "Codex target",
      notes: "Notes / Errors",
      frontmatter: "Frontmatter",
      bodyPreview: "Body preview",
      empty_value: "(none)",
      emptyList: "(empty)",
    },
    action: {
      selectedGroup: "Selected skill",
      allGroup: "All skills",
      unsupportedGroup: "Not yet supported",
      syncSelClaude: "Sync Selected to Claude",
      syncSelCodex: "Sync Selected to Codex",
      syncSelBoth: "Sync Selected to Both",
      syncAllClaude: "Sync All to Claude",
      syncAllCodex: "Sync All to Codex",
      syncAllBoth: "Sync All to Both",
      syncGemini: "Sync to Gemini",
      syncOpenCode: "Sync to OpenCode",
      syncHermes: "Sync to Hermes",
      noSelectedAlert: "No skill selected.",
      unsupportedAlert: "Sync to {tool} is not yet supported.",
      conflictAlert: "Conflict syncing {name} to {tool}:\n{message}",
      errorAlert: "Error syncing {name} to {tool}:\n{message}",
      browseFail: "Browse failed:\n{message}",
      importFail: "Import failed:\n{message}",
      openFail: "Open failed:\n{message}",
    },
    log: {
      title: "Logs",
      empty: "No activity yet.",
    },
    inspector: {
      title: "CLI Inspector",
      rescanHint: "Scan a tool's skills directory to see what actually lives there.",
      empty: "No entries. Click a Rescan button to inspect a tool.",
      kind: {
        managed: "managed",
        "stray-link": "stray link",
        shadowing: "shadowing",
        external: "external",
      },
      kindHelp: {
        managed: "Junction points back to the matching skill in the shared root.",
        "stray-link":
          "Junction, but it points somewhere that is not the shared root skill. Safe to unlink.",
        shadowing:
          "A real folder sits here AND a same-named skill exists in the shared root. This is the conflict cause — move one or unlink.",
        external:
          "A real folder exists here but the shared root has no matching skill. Consider importing it.",
      },
      action: {
        unlink: "Unlink",
        importOwned: "Import as owned",
        importVendored: "Import as vendored",
        open: "Open folder",
      },
      confirm: {
        unlink: "Remove the junction at {path}? The real files it points at are untouched.",
      },
      emptyForTool: "No entries scanned for {tool} yet.",
    },
    skill: {
      origin: "Origin",
      hidden: "Hidden",
      frozen: "Frozen",
      showHidden: "Show hidden",
      frozenNote: "Frozen — excluded from Sync All. Unfreeze to include in batches.",
      hiddenNote: "Hidden — excluded from the default list and batch sync.",
      batchSkippedFrozen: "Skipped {name}: frozen.",
      batchSkippedHidden: "Skipped {name}: hidden.",
    },
    origin: {
      owned: "owned",
      vendored: "vendored",
      unknown: "unknown",
    },
  },
  zh: {
    app: {
      title: "Skill Sync Manager",
      language: "语言",
      platformWarning:
        "当前版本仅支持 Windows 目录软链接同步。其他平台可以打开界面，但同步操作会报错。",
    },
    root: {
      label: "共享 Skill 根目录",
      placeholder: "例如 D:\\AgentSkills",
      browse: "浏览",
      scan: "扫描",
      import: "导入 Skill 目录",
      open: "打开共享目录",
      noRootAlert: "请先选择共享 Skill 根目录。",
      refreshSync: "刷新同步状态",
      rescanClaude: "重新扫描 Claude",
      rescanCodex: "重新扫描 Codex",
    },
    git: {
      title: "Git 状态",
      none: "尚无状态。",
      available: "Git 可用",
      repository: "Git 仓库",
      branch: "分支",
      remote: "已配置 Remote",
      dirty: "有未提交修改",
      remotes: "Remote 列表",
      yes: "是",
      no: "否",
    },
    tools: {
      title: "CLI 工具",
      detecting: "检测中…",
      detected: "已检测到",
      missing: "未安装",
      supported: "支持同步",
      unsupported: "暂未支持",
      path: "地址",
    },
    table: {
      title: "Skill 列表",
      empty: "未找到 Skill。请选择共享根目录并扫描。",
      name: "名称",
      description: "描述",
      valid: "有效",
      claude: "Claude",
      codex: "Codex",
      path: "路径",
      noDescription: "（无描述）",
      unknown: "未知",
      resetColumns: "重置列宽",
    },
    split: {
      resize: "拖动调整大小",
    },
    detail: {
      empty: "选中一个 Skill 查看详情。",
      header: "当前 Skill",
      name: "名称",
      valid: "有效",
      description: "描述",
      skillPath: "Skill 路径",
      claudeTarget: "Claude 目标路径",
      codexTarget: "Codex 目标路径",
      notes: "提示 / 错误",
      frontmatter: "Frontmatter",
      bodyPreview: "正文预览",
      empty_value: "（无）",
      emptyList: "（空）",
    },
    action: {
      selectedGroup: "当前 Skill",
      allGroup: "所有 Skill",
      unsupportedGroup: "暂未支持",
      syncSelClaude: "将当前 Skill 同步到 Claude",
      syncSelCodex: "将当前 Skill 同步到 Codex",
      syncSelBoth: "将当前 Skill 同步到全部",
      syncAllClaude: "将所有 Skill 同步到 Claude",
      syncAllCodex: "将所有 Skill 同步到 Codex",
      syncAllBoth: "将所有 Skill 同步到全部",
      syncGemini: "同步到 Gemini",
      syncOpenCode: "同步到 OpenCode",
      syncHermes: "同步到 Hermes",
      noSelectedAlert: "未选择 Skill。",
      unsupportedAlert: "暂未支持同步到 {tool}。",
      conflictAlert: "同步 {name} 到 {tool} 冲突：\n{message}",
      errorAlert: "同步 {name} 到 {tool} 出错：\n{message}",
      browseFail: "浏览失败：\n{message}",
      importFail: "导入失败：\n{message}",
      openFail: "打开失败：\n{message}",
    },
    log: {
      title: "日志",
      empty: "暂无活动。",
    },
    inspector: {
      title: "CLI 检查器",
      rescanHint: "扫描某个 CLI 工具的 skill 目录，查看实际存在的内容。",
      empty: "暂无条目。点击上方的重新扫描按钮开始检查。",
      kind: {
        managed: "已管理",
        "stray-link": "无效链接",
        shadowing: "遮蔽冲突",
        external: "外来",
      },
      kindHelp: {
        managed: "链接指向共享根里对应的 skill，状态正常。",
        "stray-link": "是链接，但指向的并不是共享根里的 skill。可以安全解除。",
        shadowing:
          "本地是真实目录，共享根里有同名 skill。这是 conflict 的典型原因——迁移其中一侧或解除。",
        external: "本地是真实目录，共享根里没有同名 skill。可以考虑导入。",
      },
      action: {
        unlink: "解除链接",
        importOwned: "导入为 自建",
        importVendored: "导入为 下载",
        open: "打开目录",
      },
      confirm: {
        unlink: "移除位于 {path} 的链接？目标数据本身不会被删除。",
      },
      emptyForTool: "尚未扫描 {tool} 的条目。",
    },
    skill: {
      origin: "来源",
      hidden: "隐藏",
      frozen: "冻结",
      showHidden: "显示隐藏",
      frozenNote: "已冻结——批量同步时跳过。解冻后才会加入批量操作。",
      hiddenNote: "已隐藏——默认列表和批量同步都会跳过。",
      batchSkippedFrozen: "已跳过 {name}：已冻结。",
      batchSkippedHidden: "已跳过 {name}：已隐藏。",
    },
    origin: {
      owned: "自建",
      vendored: "下载",
      unknown: "未知",
    },
  },
};

function lookup(tree: MessageTree, key: string): string | undefined {
  const parts = key.split(".");
  let node: string | MessageTree | undefined = tree;
  for (const p of parts) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as MessageTree)[p];
  }
  return typeof node === "string" ? node : undefined;
}

function format(tpl: string, vars?: Record<string, string>): string {
  if (!vars) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "skill-sync-manager.lang";

function detectInitialLang(): Lang {
  if (typeof window !== "undefined") {
    const saved = window.localStorage?.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
    const nav = (typeof navigator !== "undefined" ? navigator.language : "") ?? "";
    if (nav.toLowerCase().startsWith("zh")) return "zh";
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  useEffect(() => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, lang);
    } catch {
      /* storage may be unavailable */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);

  const t = useCallback(
    (key: string, vars?: Record<string, string>) => {
      const tree = messages[lang];
      const hit = lookup(tree, key);
      if (hit !== undefined) return format(hit, vars);
      const fallback = lookup(messages.en, key);
      return fallback !== undefined ? format(fallback, vars) : key;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}
