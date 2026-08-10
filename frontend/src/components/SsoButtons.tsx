import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.5 15.6 18.9 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.7 34.9 27 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.4 36.3 44 30.7 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#F35325" d="M1 1h10v10H1z" />
      <path fill="#81BC06" d="M12 1h10v10H12z" />
      <path fill="#05A6F0" d="M1 12h10v10H1z" />
      <path fill="#FFBA08" d="M12 12h10v10H12z" />
    </svg>
  );
}

export default function SsoButtons({ next }: { next: string }) {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<{ google: boolean; microsoft: boolean; apple: boolean } | null>(null);

  useEffect(() => {
    api.oauthProviders().then(setProviders).catch(() => setProviders(null));
  }, []);

  if (!providers || (!providers.google && !providers.microsoft && !providers.apple)) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
        <span className="h-px flex-1 bg-surface-border" />
        {t("auth.sso.divider")}
        <span className="h-px flex-1 bg-surface-border" />
      </div>
      {providers.google && (
        <a
          href={api.oauthLoginUrl("google", next)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-surface-2 dark:text-slate-300"
        >
          <GoogleIcon /> {t("auth.sso.google")}
        </a>
      )}
      {providers.microsoft && (
        <a
          href={api.oauthLoginUrl("microsoft", next)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-surface-2 dark:text-slate-300"
        >
          <MicrosoftIcon /> {t("auth.sso.microsoft")}
        </a>
      )}
      {providers.apple && (
        <a
          href={api.oauthLoginUrl("apple", next)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-surface-2 dark:text-slate-300"
        >
          {t("auth.sso.apple")}
        </a>
      )}
    </div>
  );
}
