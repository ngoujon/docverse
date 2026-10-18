import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal, { ModalActions } from "../ui/Modal";
import { Field, inputClass } from "../ui/controls";
import type { Space } from "../../types";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6"];

export interface SpaceFormData {
  name: string;
  description: string;
  color: string;
}

interface Props {
  open: boolean;
  /** The space being edited, or nothing to create a new one. */
  initial?: Space | null;
  onClose: () => void;
  onSubmit: (data: SpaceFormData) => void;
}

const textInput = `${inputClass} placeholder:text-slate-400 dark:placeholder:text-slate-500`;

/** Create / edit form of a workspace (name, description, color). */
export default function SpaceModal({ open, initial, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);

  const isEdit = !!initial;

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim(), color });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t("app.spaceModal.editTitle") : t("app.spaceModal.createTitle")}
      titleId="space-modal-title"
    >
      <div className="mt-4 space-y-3">
        <Field label={t("app.spaceModal.name")}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={t("app.spaceModal.namePlaceholder")}
            className={textInput}
          />
        </Field>
        <Field label={t("app.spaceModal.description")}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={t("app.spaceModal.descriptionPlaceholder")}
            className={`${textInput} resize-none`}
          />
        </Field>
        <Field label={t("app.spaceModal.color")}>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`${t("app.spaceModal.color")} ${c}`}
                aria-pressed={color === c}
                className="h-7 w-7 rounded-full ring-offset-2 ring-offset-surface-2 transition"
                style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px ${c}` : "none" }}
              />
            ))}
          </div>
        </Field>
      </div>

      <ModalActions
        onCancel={onClose}
        onSubmit={handleSubmit}
        submitLabel={isEdit ? t("app.spaceModal.save") : t("app.spaceModal.create")}
        disabled={!name.trim()}
      />
    </Modal>
  );
}
