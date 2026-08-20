import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, RefreshCw, X } from "lucide-react";
import { useEscapeToClose } from "../hooks/useEscapeToClose";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { email: string; password: string; display_name: string; role: "admin" | "user" }) => Promise<void>;
}

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^&*-_+=";

function generatePassword(length = 20): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join("");
}

export default function CreateUserModal({ open, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [role, setRole] = useState<"admin" | "user">("user");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEscapeToClose(open, onClose);

  if (!open) return null;

  const reset = () => {
    setEmail("");
    setDisplayName("");
    setPassword(generatePassword());
    setRole("user");
    setCopied(false);
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const copyPassword = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async () => {
    if (!email.trim() || password.length < 8) return;
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({ email: email.trim(), password, display_name: displayName.trim(), role });
      reset();
    } catch {
      setError(t("admin.users.createError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-surface-border bg-surface-2 p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-modal-title"
      >
        <div className="flex items-center justify-between">
          <h3 id="create-user-modal-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("admin.users.createTitle")}
          </h3>
          <button
            onClick={handleClose}
            aria-label={t("common.close")}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {t("admin.table.email")}
            </label>
            <input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {t("admin.table.displayName")}
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {t("admin.users.password")}
            </label>
            <div className="flex items-center gap-1.5">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
              />
              <button
                type="button"
                title={t("admin.users.generatePassword")}
                onClick={() => setPassword(generatePassword())}
                className="shrink-0 rounded-lg border border-surface-border p-2 text-slate-600 dark:text-slate-400 hover:bg-surface-3"
              >
                <RefreshCw size={14} />
              </button>
              <button
                type="button"
                title={t("admin.users.copyPassword")}
                onClick={copyPassword}
                className="shrink-0 rounded-lg border border-surface-border p-2 text-slate-600 dark:text-slate-400 hover:bg-surface-3"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              {t("admin.table.role")}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "user")}
              className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
            >
              <option value="user">{t("admin.users.roleUser")}</option>
              <option value="admin">{t("admin.users.roleAdmin")}</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-surface-3"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!email.trim() || password.length < 8 || submitting}
            className="rounded-lg bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
          >
            {t("admin.users.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
