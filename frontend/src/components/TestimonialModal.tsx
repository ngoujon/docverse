import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Star } from "lucide-react";
import { useEscapeToClose } from "../hooks/useEscapeToClose";
import type { Testimonial, TestimonialInput } from "../types";

interface Props {
  open: boolean;
  initial?: Testimonial | null;
  onClose: () => void;
  onSubmit: (data: TestimonialInput) => void;
}

export default function TestimonialModal({ open, initial, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [authorName, setAuthorName] = useState(initial?.author_name ?? "");
  const [authorRole, setAuthorRole] = useState(initial?.author_role ?? "");
  const [authorCompany, setAuthorCompany] = useState(initial?.author_company ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [rating, setRating] = useState(initial?.rating ?? 5);
  const [published, setPublished] = useState(initial?.published ?? false);

  useEscapeToClose(open, onClose);

  if (!open) return null;

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-surface-border bg-surface-2 p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="testimonial-modal-title"
      >
        <div className="flex items-center justify-between">
          <h3 id="testimonial-modal-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isEdit ? t("admin.testimonials.editTitle") : t("admin.testimonials.createTitle")}
          </h3>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                {t("admin.testimonials.authorName")}
              </label>
              <input
                autoFocus
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                {t("admin.testimonials.authorRole")}
              </label>
              <input
                value={authorRole}
                onChange={(e) => setAuthorRole(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {t("admin.testimonials.authorCompany")}
            </label>
            <input
              value={authorCompany}
              onChange={(e) => setAuthorCompany(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {t("admin.testimonials.content")}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {t("admin.testimonials.rating")}
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n}/5`}
                  className="p-0.5"
                >
                  <Star
                    size={20}
                    className={n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"}
                  />
                </button>
              ))}
            </div>
          </div>
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

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-surface-3"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!authorName.trim() || !content.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
          >
            {isEdit ? t("common.save") : t("admin.testimonials.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
