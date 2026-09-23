import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useEscapeToClose } from "../hooks/useEscapeToClose";

interface Props {
  open: boolean;
  recipientCount: number;
  sending?: boolean;
  onClose: () => void;
  onSubmit: (data: { subject: string; message: string }) => void;
}

export default function NewsletterCampaignModal({ open, recipientCount, sending, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  useEscapeToClose(open, onClose);

  if (!open) return null;

  const canSubmit = subject.trim().length > 0 && message.trim().length > 0 && !sending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ subject: subject.trim(), message: message.trim() });
    setSubject("");
    setMessage("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-surface-border bg-surface-2 p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="newsletter-campaign-modal-title"
      >
        <div className="flex items-center justify-between">
          <h3 id="newsletter-campaign-modal-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("admin.newsletter.composeTitle")}
          </h3>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {t("admin.newsletter.composeHint", { count: recipientCount })}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {t("admin.newsletter.subject")}
            </label>
            <input
              autoFocus
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {t("admin.newsletter.message")}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              maxLength={20000}
              className="w-full resize-none rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-surface-3"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
          >
            {sending ? t("admin.newsletter.sending") : t("admin.newsletter.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
