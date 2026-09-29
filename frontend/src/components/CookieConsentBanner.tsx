import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart3 } from "lucide-react";
import { readConsent, setConsent } from "../utils/analytics";

/** Opt-in banner for the audience measurement. Nothing is measured
 * until "accept" is clicked, and the answer is remembered so the banner is
 * shown once. */
export default function CookieConsentBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  // Mount-time check keeps the prerendered markup identical for everyone.
  useEffect(() => {
    setVisible(readConsent() === null);
  }, []);

  if (!visible) return null;

  const answer = (choice: "granted" | "denied") => {
    setConsent(choice);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("cookies.title")}
      // z-50 stays under the support chat widget (z-60), and the desktop
      // placement is bottom-left so the two never overlap.
      className="fixed inset-x-0 bottom-0 z-50 border-t border-retro-border bg-retro-panel/95 p-4 shadow-lg backdrop-blur sm:inset-x-auto sm:bottom-6 sm:left-6 sm:max-w-md sm:rounded-2xl sm:border"
    >
      <div className="flex items-center gap-2">
        <BarChart3 size={16} className="shrink-0 text-retro-cyan" />
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-900">
          {t("cookies.title")}
        </h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        {t("cookies.body")}{" "}
        <Link to="/confidentialite" className="text-retro-cyan underline">
          {t("cookies.learnMore")}
        </Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => answer("granted")}
          className="rounded-md bg-retro-pink px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white"
        >
          {t("cookies.accept")}
        </button>
        <button
          onClick={() => answer("denied")}
          className="rounded-md border border-retro-border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-900"
        >
          {t("cookies.decline")}
        </button>
      </div>
    </div>
  );
}
