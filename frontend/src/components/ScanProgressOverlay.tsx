import { useEffect, useRef } from "react";
import { useLanguage } from "../i18n";

interface Props {
  open: boolean;
  onCancel: () => void;
}

// 扫描期间的轻量遮罩。
// - 显示"正在扫描"与一圈 spinner，给用户明确的"进行中"信号，避免被当成卡死；
// - 右上角 X / 底部取消按钮都能调用 onCancel —— 取消不会 abort 后端 goroutine
//   （Wails 不支持），但会在前端层面立即关闭遮罩并丢弃结果，满足"无论如何都能脱困"；
// - Esc 键同样触发 onCancel，与其他 modal 约定一致。
export function ScanProgressOverlay({ open, onCancel }: Props) {
  const { t } = useLanguage();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    cancelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="scan-overlay"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-label={t("scan.overlay.title")}
    >
      <div className="scan-overlay-card">
        <button
          type="button"
          className="scan-overlay-close"
          onClick={onCancel}
          aria-label={t("scan.overlay.close")}
          title={t("scan.overlay.close")}
        >
          ×
        </button>
        <div className="scan-overlay-spinner" aria-hidden />
        <div className="scan-overlay-title">{t("scan.overlay.title")}</div>
        <div className="scan-overlay-hint">{t("scan.overlay.hint")}</div>
        <button
          ref={cancelRef}
          type="button"
          className="scan-overlay-cancel"
          onClick={onCancel}
        >
          {t("scan.overlay.cancel")}
        </button>
      </div>
    </div>
  );
}
