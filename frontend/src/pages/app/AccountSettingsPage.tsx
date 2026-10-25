import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import { usePageMeta } from "../../hooks/usePageMeta";
import DashboardNav from "../../components/layout/DashboardNav";
import { SectionTitle } from "../../components/account/AccountCard";
import { DeleteAccountCard, GdprCard, ProfileCard, UsageCard } from "../../components/account/ProfileSections";
import { LogoutEverywhereCard, PasswordCard, TwoFactorCard } from "../../components/account/SecuritySections";
import type { MeStats } from "../../types";
import { pageTitle } from "../../brand";

/** "My account": profile, usage, security (sessions, password, 2FA), GDPR
 * export and account deletion. */
export default function AccountSettingsPage() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  usePageMeta({ title: pageTitle(t("auth.account.title")), noindex: true });

  const [stats, setStats] = useState<MeStats | null>(null);
  useEffect(() => {
    api
      .meStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  if (!user) return null;

  return (
    <div className="min-h-[100dvh] bg-surface-0">
      <DashboardNav active="client" />

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-8 sm:px-6 sm:pb-12 sm:pt-10">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {t("auth.account.title")}
        </h1>
        <ProfileCard user={user} refresh={refresh} />

        <SectionTitle>{t("auth.account.usage.title")}</SectionTitle>
        {stats && <UsageCard stats={stats} />}

        <SectionTitle>{t("auth.account.security")}</SectionTitle>
        <LogoutEverywhereCard />
        <PasswordCard />
        <TwoFactorCard user={user} refresh={refresh} />

        <SectionTitle>{t("auth.account.gdpr.title")}</SectionTitle>
        <GdprCard userId={user.id} />

        <SectionTitle danger>{t("auth.account.dangerZone")}</SectionTitle>
        <DeleteAccountCard />
      </main>
    </div>
  );
}
