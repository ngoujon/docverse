import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, RefreshCw } from "lucide-react";
import Modal, { ModalActions } from "../ui/Modal";
import { Field, inputClass } from "../ui/controls";

interface NewUser {
  email: string;
  password: string;
  display_name: string;
  role: "admin" | "user";
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: NewUser) => Promise<void>;
}

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^&*-_+=";

/** Random password from an alphabet without look-alike characters (0/O, 1/l). */
function generatePassword(length = 20): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join("");
}

const iconButton =
  "shrink-0 rounded-lg border border-surface-border p-2 text-slate-600 dark:text-slate-400 hover:bg-surface-3";

/** Admin form creating an account on someone's behalf, with a generated
 * password the admin copies and hands over. */
export default function CreateUserModal({ open, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [role, setRole] = useState<NewUser["role"]>("user");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
    <Modal
      open={open}
      onClose={handleClose}
      title={t("admin.users.createTitle")}
      titleId="create-user-modal-title"
      className="max-h-[90vh] max-w-md overflow-y-auto"
    >
      <div className="mt-4 space-y-3">
        <Field label={t("admin.table.email")}>
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t("admin.table.displayName")}>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
        </Field>
        <Field label={t("admin.users.password")}>
          <div className="flex items-center gap-1.5">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} font-mono`}
            />
            <button
              type="button"
              title={t("admin.users.generatePassword")}
              onClick={() => setPassword(generatePassword())}
              className={iconButton}
            >
              <RefreshCw size={14} />
            </button>
            <button type="button" title={t("admin.users.copyPassword")} onClick={copyPassword} className={iconButton}>
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
          </div>
        </Field>
        <Field label={t("admin.table.role")}>
          <select value={role} onChange={(e) => setRole(e.target.value as NewUser["role"])} className={inputClass}>
            <option value="user">{t("admin.users.roleUser")}</option>
            <option value="admin">{t("admin.users.roleAdmin")}</option>
          </select>
        </Field>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <ModalActions
        onCancel={handleClose}
        onSubmit={handleSubmit}
        submitLabel={t("admin.users.create")}
        disabled={!email.trim() || password.length < 8 || submitting}
      />
    </Modal>
  );
}
