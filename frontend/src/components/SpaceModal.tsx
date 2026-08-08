import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Eye, EyeOff, Lock } from "lucide-react";
import type { Space } from "../types";

const COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
];

export interface SpaceFormData {
  name: string;
  description: string;
  color: string;
  password?: string;
}

interface Props {
  open: boolean;
  initial?: Space | null;
  onClose: () => void;
  onSubmit: (data: SpaceFormData) => void;
}

export default function SpaceModal({ open, initial, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [removePassword, setRemovePassword] = useState(false);

  if (!open) return null;

  const isEdit = !!initial;
  const hadPassword = !!initial?.has_password;

  const handleSubmit = () => {
    if (!name.trim()) return;
    const data: SpaceFormData = { name: name.trim(), description: description.trim(), color };
    if (!isEdit) {
      if (password) data.password = password;
    } else if (removePassword) {
      data.password = "";
    } else if (password) {
      data.password = password;
    }
    onSubmit(data);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-surface-border bg-surface-2 p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            {isEdit ? t("app.spaceModal.editTitle") : t("app.spaceModal.createTitle")}
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("app.spaceModal.name")}</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={t("app.spaceModal.namePlaceholder")}
              className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {t("app.spaceModal.description")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t("app.spaceModal.descriptionPlaceholder")}
              className="w-full resize-none rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("app.spaceModal.color")}</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full ring-offset-2 ring-offset-surface-2 transition"
                  style={{
                    backgroundColor: c,
                    boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <Lock size={12} />
              {t("app.spaceModal.password")}
            </label>
            <div className="relative">
              <input
                type={passwordVisible ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isEdit && removePassword}
                placeholder={
                  isEdit && hadPassword
                    ? t("app.spaceModal.passwordPlaceholderKeep")
                    : t("app.spaceModal.passwordPlaceholderNew")
                }
                className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 pr-9 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-accent disabled:opacity-40"
              />
              <button
                type="button"
                onClick={() => setPasswordVisible((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                tabIndex={-1}
              >
                {passwordVisible ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {isEdit && hadPassword && (
              <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={removePassword}
                  onChange={(e) => setRemovePassword(e.target.checked)}
                  className="accent-accent"
                />
                {t("app.spaceModal.removePassword")}
              </label>
            )}
            <p className="mt-1 text-[11px] text-slate-600">{t("app.spaceModal.helper")}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-surface-3"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
          >
            {isEdit ? t("app.spaceModal.save") : t("app.spaceModal.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
