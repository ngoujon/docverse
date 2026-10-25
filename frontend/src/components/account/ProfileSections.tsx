/** Account settings: profile, usage, GDPR export and account deletion. */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BadgeCheck, BadgeX, Download, HardDrive, KeyRound, Mail, Scale, Trash2 } from "lucide-react";
import { api, downloadBlob } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import ConfirmDialog from "../ui/ConfirmDialog";
import { buttonOutline, ProgressBar } from "../ui/controls";
import { formatBytes } from "../../utils/format";
import type { MeStats, User } from "../../types";
import { BRAND } from "../../brand";
import { cardClass, CardRow, Feedback, iconMuted, input, muted } from "./AccountCard";

/** Email (+ verification status) and editable display name. */
export function ProfileCard({ user, refresh }: { user: User; refresh: () => Promise<void> }) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [profileMessage, setProfileMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [resendMessage, setResendMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const profile = useAsyncAction();
  const resend = useAsyncAction();

  const handleSaveProfile = async () => {
    setProfileMessage(null);
    const ok = await profile.run(async () => {
      await api.updateProfile(displayName.trim());
      await refresh();
    });
    if (ok) setProfileMessage({ ok: true, text: t("auth.account.profile.saved") });
  };

  const handleResendVerification = async () => {
    setResendMessage(null);
    if (await resend.run(() => api.resendVerification())) {
      setResendMessage({ ok: true, text: t("auth.account.profile.resendDone") });
    }
  };

  const profileFeedback = profileMessage ?? (profile.error ? { ok: false, text: profile.error } : null);
  const resendFeedback = resendMessage ?? (resend.error ? { ok: false, text: resend.error } : null);

  return (
    <div className={`mt-6 ${cardClass}`}>
      <p className="text-sm text-slate-800 dark:text-slate-200">{user.email}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {user.email_verified ? (
          <span className="flex items-center gap-1.5">
            <BadgeCheck size={14} className="text-emerald-500" />
            <span className="text-emerald-600 dark:text-emerald-400">{t("auth.account.emailVerified")}</span>
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <BadgeX size={14} className="text-amber-500" />
              <span className="text-amber-600 dark:text-amber-400">{t("auth.account.emailNotVerified")}</span>
            </span>
            <button
              onClick={handleResendVerification}
              disabled={resend.busy}
              className="flex items-center gap-1 text-accent hover:underline disabled:opacity-40"
            >
              <Mail size={12} />
              {t("auth.account.profile.resendVerification")}
            </button>
          </>
        )}
      </div>
      {resendFeedback && <Feedback {...resendFeedback} />}

      <div className="mt-4 border-t border-surface-border pt-4">
        <label htmlFor="account-display-name" className="text-xs font-medium text-slate-600 dark:text-slate-400">
          {t("auth.account.profile.displayName")}
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id="account-display-name"
            value={displayName}
            maxLength={120}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setProfileMessage(null);
              profile.setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSaveProfile()}
            className={`${input} flex-1`}
          />
          <button
            onClick={handleSaveProfile}
            disabled={profile.busy || displayName.trim() === user.display_name}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
          >
            {t("auth.account.profile.save")}
          </button>
        </div>
        {profileFeedback && <Feedback {...profileFeedback} />}
      </div>
    </div>
  );
}

/** Storage bar and the account's quotas. */
export function UsageCard({ stats }: { stats: MeStats }) {
  const { t } = useTranslation();
  const counters: { value: number; limit?: number | null; label: string }[] = [
    { value: stats.owned_spaces, limit: stats.space_limit, label: t("auth.account.usage.spaces") },
    { value: stats.document_count, label: t("auth.account.usage.documents") },
    { value: stats.conversation_count, label: t("auth.account.usage.conversations") },
    {
      value: stats.messages_today ?? 0,
      limit: stats.messages_per_day_limit,
      label: t("auth.account.usage.questionsToday"),
    },
  ];
  return (
    <div className={`mt-3 ${cardClass}`}>
      <div className="flex items-center gap-2">
        <HardDrive size={15} className={iconMuted} />
        <p className="text-sm text-slate-800 dark:text-slate-200">{t("auth.account.usage.freeNote")}</p>
      </div>
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{t("auth.account.usage.storage")}</span>
          <span>
            {formatBytes(stats.storage_bytes)}
            {stats.storage_limit_bytes != null && ` / ${formatBytes(stats.storage_limit_bytes)}`}
          </span>
        </div>
        {stats.storage_limit_bytes != null && stats.storage_limit_bytes > 0 && (
          <ProgressBar ratio={stats.storage_bytes / stats.storage_limit_bytes} warn={false} className="h-1.5" />
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {counters.map((c) => (
          <div key={c.label}>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {c.value}
              {c.limit != null && <span className="text-slate-400"> / {c.limit}</span>}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** GDPR: link to the privacy policy and a JSON export of the account's data. */
export function GdprCard({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { busy, run } = useAsyncAction();

  const handleExport = () =>
    run(async () => {
      const data = await api.exportAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      downloadBlob(blob, `${BRAND.name.toLowerCase()}-export-${userId}.json`);
    });

  return (
    <div className={`mt-3 ${cardClass}`}>
      <div className="flex items-start gap-2">
        <Scale size={15} className={`mt-0.5 shrink-0 ${iconMuted}`} />
        <p className={muted}>
          {t("auth.account.gdpr.hint")}{" "}
          <Link to="/confidentialite/" className="text-accent hover:underline">
            {t("auth.account.gdpr.privacyLink")}
          </Link>
          .
        </p>
      </div>
      <CardRow
        className="mt-4 border-t border-surface-border pt-4"
        icon={<Download size={15} className={iconMuted} />}
        label={t("auth.account.exportData")}
        action={
          <button onClick={handleExport} disabled={busy} className={buttonOutline}>
            {t("auth.account.exportData")}
          </button>
        }
      />
    </div>
  );
}

/** Account deletion, confirmed by password and a dialog. */
export function DeleteAccountCard() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { error, run } = useAsyncAction();

  const handleDeleteAccount = async () => {
    if (!password) return;
    setDeleting(true);
    const ok = await run(() => api.deleteAccount(password));
    if (ok) {
      logout();
      navigate("/");
    } else {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/5 p-5">
      <div className="flex items-center gap-2">
        <Trash2 size={15} className="text-red-500" />
        <span className="text-sm text-slate-800 dark:text-slate-200">{t("auth.account.deleteAccount")}</span>
      </div>
      <p className={`mt-1.5 ${muted}`}>{t("auth.account.deleteAccountWarning")}</p>
      <p className={`mt-3 ${muted}`}>{t("auth.account.deleteAccountConfirm")}</p>
      <div className="mt-2 flex items-center gap-2">
        <div className="relative flex-1">
          <KeyRound
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="password"
            aria-label={t("auth.account.deletePasswordLabel")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-0 py-2 pl-8 pr-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-red-400"
          />
        </div>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!password}
          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40"
        >
          {t("auth.account.deleteAccount")}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <ConfirmDialog
        open={confirmOpen}
        title={t("auth.account.deleteAccount")}
        message={t("auth.account.deleteAccountWarning")}
        confirmLabel={deleting ? t("common.loading") : t("common.delete")}
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
