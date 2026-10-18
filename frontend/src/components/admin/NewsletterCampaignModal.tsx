import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal, { ModalActions } from "../ui/Modal";
import { Field, inputClass } from "../ui/controls";

interface Props {
  open: boolean;
  recipientCount: number;
  sending?: boolean;
  onClose: () => void;
  onSubmit: (data: { subject: string; message: string }) => void;
}

/** Composes a plain-text campaign sent to every confirmed subscriber. */
export default function NewsletterCampaignModal({ open, recipientCount, sending, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const canSubmit = subject.trim().length > 0 && message.trim().length > 0 && !sending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ subject: subject.trim(), message: message.trim() });
    setSubject("");
    setMessage("");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("admin.newsletter.composeTitle")}
      titleId="newsletter-campaign-modal-title"
      className="max-h-[90vh] max-w-lg overflow-y-auto"
    >
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {t("admin.newsletter.composeHint", { count: recipientCount })}
      </p>

      <div className="mt-4 space-y-3">
        <Field label={t("admin.newsletter.subject")}>
          <input
            autoFocus
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            className={inputClass}
          />
        </Field>
        <Field label={t("admin.newsletter.message")}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            maxLength={20000}
            className={`${inputClass} resize-none`}
          />
        </Field>
      </div>

      <ModalActions
        onCancel={onClose}
        onSubmit={handleSubmit}
        submitLabel={sending ? t("admin.newsletter.sending") : t("admin.newsletter.send")}
        disabled={!canSubmit}
      />
    </Modal>
  );
}
