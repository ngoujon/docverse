import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import Modal, { ModalActions } from "../ui/Modal";
import { Field, inputClass } from "../ui/controls";
import type { Testimonial, TestimonialInput } from "../../types";

interface Props {
  open: boolean;
  initial?: Testimonial | null;
  onClose: () => void;
  onSubmit: (data: TestimonialInput) => void;
}

/** Create / edit form of a homepage testimonial. */
export default function TestimonialModal({ open, initial, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [authorName, setAuthorName] = useState(initial?.author_name ?? "");
  const [authorRole, setAuthorRole] = useState(initial?.author_role ?? "");
  const [authorCompany, setAuthorCompany] = useState(initial?.author_company ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [rating, setRating] = useState(initial?.rating ?? 5);
  const [published, setPublished] = useState(initial?.published ?? false);

  const isEdit = !!initial;

  const handleSubmit = () => {
    if (!authorName.trim() || !content.trim()) return;
    onSubmit({
      author_name: authorName.trim(),
      author_role: authorRole.trim(),
      author_company: authorCompany.trim(),
      content: content.trim(),
      rating,
      published,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t("admin.testimonials.editTitle") : t("admin.testimonials.createTitle")}
      titleId="testimonial-modal-title"
      className="max-h-[90vh] max-w-md overflow-y-auto"
    >
      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("admin.testimonials.authorName")}>
            <input
              autoFocus
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("admin.testimonials.authorRole")}>
            <input value={authorRole} onChange={(e) => setAuthorRole(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label={t("admin.testimonials.authorCompany")}>
          <input value={authorCompany} onChange={(e) => setAuthorCompany(e.target.value)} className={inputClass} />
        </Field>
        <Field label={t("admin.testimonials.content")}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </Field>
        <Field label={t("admin.testimonials.rating")}>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n}/5`} className="p-0.5">
                <Star
                  size={20}
                  className={n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"}
                />
              </button>
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="accent-accent"
          />
          {t("admin.testimonials.published")}
        </label>
      </div>

      <ModalActions
        onCancel={onClose}
        onSubmit={handleSubmit}
        submitLabel={isEdit ? t("common.save") : t("admin.testimonials.create")}
        disabled={!authorName.trim() || !content.trim()}
      />
    </Modal>
  );
}
