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

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 384 512" aria-hidden="true" fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.03 11.03 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.43-2.7 5.4-5.27 5.69.42.36.78 1.08.78 2.17 0 1.57-.01 2.83-.01 3.22 0 .31.21.66.79.55A10.51 10.51 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5Z"/>
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="#0A66C2">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45Z"/>
    </svg>
  );
}

export default function SsoButtons({ next }: { next: string }) {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<{
    google: boolean;
    apple: boolean;
    github: boolean;
    linkedin: boolean;
  } | null>(null);

  useEffect(() => {
    api.oauthProviders().then(setProviders).catch(() => setProviders(null));
  }, []);

  if (!providers || (!providers.google && !providers.apple && !providers.github && !providers.linkedin))
    return null;

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
      {providers.apple && (
        <a
          href={api.oauthLoginUrl("apple", next)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-surface-2 dark:text-slate-300"
        >
          <AppleIcon /> {t("auth.sso.apple")}
        </a>
      )}
      {providers.github && (
        <a
          href={api.oauthLoginUrl("github", next)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-surface-2 dark:text-slate-300"
        >
          <GitHubIcon /> {t("auth.sso.github")}
        </a>
      )}
      {providers.linkedin && (
        <a
          href={api.oauthLoginUrl("linkedin", next)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border bg-surface-1 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-surface-2 dark:text-slate-300"
        >
          <LinkedInIcon /> {t("auth.sso.linkedin")}
        </a>
      )}
    </div>
  );
}
