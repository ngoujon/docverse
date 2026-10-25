import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

/** Privacy / terms / legal notice links for pages without the landing
 * page's full footer, so the privacy policy is reachable from every page. */
export default function LegalFooterLinks({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const linkClass = "text-xs text-slate-500 transition hover:text-slate-900 dark:hover:text-slate-200";
  return (
    <footer className={`flex flex-wrap items-center justify-center gap-4 ${className}`}>
      <Link to="/confidentialite/" className={linkClass}>
        {t("footer.privacy")}
      </Link>
      <Link to="/cgu/" className={linkClass}>
        {t("footer.terms")}
      </Link>
      <Link to="/mentions-legales/" className={linkClass}>
        {t("footer.legal")}
      </Link>
    </footer>
  );
}
