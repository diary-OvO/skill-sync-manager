import type { CSSProperties, FC } from "react";
import type { ToolName } from "../../types";

// 官方 / 公开品牌 SVG 以 URL 形式导入，运行时用 <img> 渲染；
// 灰态由按钮层的 `filter: grayscale(1)` 实现，无需切换资源。
import claudeSvg from "./claude.svg";
import codexSvg from "./codex.svg";
import geminiSvg from "./gemini.svg";
import hermesSvg from "./hermes.svg";
import opencodeSvg from "./opencode.svg";

// 约束到最小必要 props，避免 img / svg 两套 HTML 属性签名相互冲突。
export interface LogoProps {
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
}

function makeImgLogo(src: string, alt: string): FC<LogoProps> {
  return function ToolLogoImg({ width = 16, height = 16, className, style }) {
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        draggable={false}
        className={className}
        style={{ display: "block", ...style }}
      />
    );
  };
}

export const TOOL_LOGO: Record<ToolName, FC<LogoProps>> = {
  claude: makeImgLogo(claudeSvg, "Claude"),
  codex: makeImgLogo(codexSvg, "Codex"),
  gemini: makeImgLogo(geminiSvg, "Gemini"),
  opencode: makeImgLogo(opencodeSvg, "OpenCode"),
  hermes: makeImgLogo(hermesSvg, "Hermes Agent"),
};

// 工具高亮态的 accent —— 取每家品牌 mark 的主色，用于 focus ring / hover。
export const TOOL_ACCENT: Record<ToolName, string> = {
  claude: "#d97757",
  codex: "#10a37f",
  gemini: "#3186ff",
  opencode: "#1f1f1f",
  hermes: "#1f1f1f",
};

export const TOOL_LABEL: Record<ToolName, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  opencode: "OpenCode",
  hermes: "Hermes",
};
