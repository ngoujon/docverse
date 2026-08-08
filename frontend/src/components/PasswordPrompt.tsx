import { useState } from "react";
import { Lock, X, Eye, EyeOff } from "lucide-react";

interface Props {
  open: boolean;
  spaceName: string;
  error?: string | null;
  submitting?: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export default function PasswordPrompt({
  open,
  spaceName,
  error,
  submitting,
  onSubmit,
  onCancel,
}: Props) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);

  if (!open) return null;

  const handleSubmit = () => {
    if (!password) return;
    onSubmit(password);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-2 p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Lock size={15} />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Espace protege</h3>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          L'espace <span className="text-slate-800">« {spaceName} »</span> est
          protege par un mot de passe. Saisissez-le pour y acceder.
        </p>

        <div className="mt-3 relative">
          <input
            autoFocus
            type={visible ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Mot de passe"
            className="w-full rounded-lg border border-surface-border bg-surface-1 px-3 py-2 pr-9 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
            tabIndex={-1}
          >
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-surface-3"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!password || submitting}
            className="rounded-lg bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
          >
            {submitting ? "Verification..." : "Deverrouiller"}
          </button>
        </div>
      </div>
    </div>
  );
}
