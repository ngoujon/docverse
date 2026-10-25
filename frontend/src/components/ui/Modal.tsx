import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { buttonGhost, buttonPrimary } from "./controls";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** id of the title element, referenced by aria-labelledby. */
  titleId: string;
  /** Width / height utilities of the panel (e.g. "max-w-md max-h-[90vh] overflow-y-auto"). */
  className?: string;
  role?: "dialog" | "alertdialog";
  /** Hides the top-right close button (confirm dialogs use explicit buttons). */
  hideClose?: boolean;
  children: ReactNode;
}

/** Centered dialog over a dimmed backdrop. Closes on Escape and on a click
 * outside the panel; renders nothing while closed. */
export default function Modal({
  open,
  onClose,
  title,
  titleId,
  className = "max-w-md",
  role = "dialog",
  hideClose = false,
  children,
}: ModalProps) {
  const { t } = useTranslation();
  useEscapeToClose(open, onClose);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-xl border border-surface-border bg-surface-1 p-6 shadow-card-lg ${className}`}
        onClick={(e) => e.stopPropagation()}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between">
          <h3 id={titleId} className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          {!hideClose && (
            <button
              onClick={onClose}
              aria-label={t("common.close")}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X size={18} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Right-aligned "Cancel / <action>" footer used by every form modal. */
export function ModalActions({
  onCancel,
  onSubmit,
  submitLabel,
  disabled,
  submitClassName = buttonPrimary,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
  submitClassName?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button onClick={onCancel} className={buttonGhost}>
        {t("common.cancel")}
      </button>
      <button onClick={onSubmit} disabled={disabled} className={submitClassName}>
        {submitLabel}
      </button>
    </div>
  );
}
