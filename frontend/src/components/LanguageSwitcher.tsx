import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages, Check } from "lucide-react";
import clsx from "clsx";
import { SUPPORTED_LANGUAGES } from "../i18n";

interface Props {
  variant?: "dark" | "light";
}

export default function LanguageSwitcher({ variant = "light" }: Props) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = i18n.language?.slice(0, 2) || "fr";

  const dark = variant === "dark";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors",
          dark
            ? "border-retro-border text-slate-700 hover:border-retro-cyan hover:text-retro-cyan"
            : "border-surface-border text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        )}
        title="Language"
      >
        <Languages size={13} />
        {current}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={clsx(
              "absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-lg border shadow-panel",
              dark
                ? "border-retro-border bg-retro-panel"
                : "border-surface-border bg-surface-1"
            )}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  i18n.changeLanguage(lang.code);
                  setOpen(false);
                }}
                className={clsx(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors",
                  dark
                    ? "text-slate-700 hover:bg-black/5"
                    : "text-slate-700 hover:bg-surface-3 dark:text-slate-300"
                )}
              >
                {lang.label}
                {current === lang.code && (
                  <Check size={13} className={dark ? "text-retro-cyan" : "text-accent"} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
