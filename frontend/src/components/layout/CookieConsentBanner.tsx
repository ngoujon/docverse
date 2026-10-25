import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart3 } from "lucide-react";
import { readConsent, setConsent } from "../../utils/analytics";

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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-retro-border bg-white/95 p-5 shadow-panel backdrop-blur sm:inset-x-auto sm:bottom-6 sm:left-6 sm:max-w-md sm:rounded-xl sm:border"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fluent-indigo-soft text-fluent-indigo">
          <BarChart3 size={15} />
        </span>
        <h2 className="text-sm font-semibold text-fluent-navy">{t("cookies.title")}</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-fluent-text">
        {t("cookies.body")}{" "}
        <Link to="/confidentialite/" className="font-medium text-fluent-indigo hover:text-fluent-navy">
          {t("cookies.learnMore")}
        </Link>
      </p>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => answer("granted")}
          className="rounded-full bg-fluent-indigo px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-fluent-navy"
        >
          {t("cookies.accept")}
        </button>
        <button
          onClick={() => answer("denied")}
          className="rounded-full border border-fluent-line bg-white px-4 py-1.5 text-sm font-semibold text-fluent-navy transition hover:border-slate-300"
        >
          {t("cookies.decline")}
        </button>
      </div>
    </div>
  );
}
