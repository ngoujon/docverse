import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BadgeCheck,
  BadgeX,
  Download,
  HardDrive,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Scale,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { api } from "../api/client";
import { setUserToken } from "../api/userToken";
import { useAuth } from "../hooks/useAuth";
import { usePageMeta } from "../hooks/usePageMeta";
import DashboardNav from "../components/DashboardNav";
import ConfirmDialog from "../components/ConfirmDialog";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import { formatBytes } from "../utils/format";
import type { MeStats, TwoFactorSetup } from "../types";
import { BRAND, pageTitle } from "../brand";

export default function AccountSettingsPage() {
  const { t } = useTranslation();
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  usePageMeta({ title: pageTitle(t("auth.account.title")), noindex: true });

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordDone, setPasswordDone] = useState(false);

  const [logoutDone, setLogoutDone] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);

  const [disablePassword, setDisablePassword] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [showDisableForm, setShowDisableForm] = useState(false);

  const [exportBusy, setExportBusy] = useState(false);

  const [stats, setStats] = useState<MeStats | null>(null);

  useEffect(() => {
    api.meStats().then(setStats).catch(() => setStats(null));
  }, []);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  if (!user) return null;

  const handleSaveProfile = async () => {
    setProfileBusy(true);
    setProfileMessage(null);
    try {
      await api.updateProfile(displayName.trim());
      await refresh();
      setProfileMessage({ ok: true, text: t("auth.account.profile.saved") });
    } catch (err) {
      setProfileMessage({ ok: false, text: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setProfileBusy(false);
    }
  };

  const handleResendVerification = async () => {
    setResendBusy(true);
    setResendMessage(null);
    try {
      await api.resendVerification();
      setResendMessage({ ok: true, text: t("auth.account.profile.resendDone") });
    } catch (err) {
      setResendMessage({ ok: false, text: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setResendBusy(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || newPassword.length < 8 || passwordBusy) return;
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      const res = await api.changePassword(currentPassword, newPassword);
      setUserToken(res.access_token);
      setShowPasswordForm(false);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordDone(true);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleLogoutEverywhere = async () => {
    setLogoutBusy(true);
    try {
      const res = await api.logoutEverywhere();
      setUserToken(res.access_token);
      setLogoutDone(true);
    } finally {
      setLogoutBusy(false);
    }
  };

  const startTwoFactorSetup = async () => {
    setSetupError(null);
    const res = await api.setup2fa();
    setSetup(res);
  };

  const confirmTwoFactorEnable = async () => {
    if (setupCode.length !== 6) return;
    setSetupBusy(true);
    setSetupError(null);
    try {
      await api.enable2fa(setupCode);
      setSetup(null);
      setSetupCode("");
      await refresh();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSetupBusy(false);
    }
  };

  const confirmTwoFactorDisable = async () => {
    if (!disablePassword) return;
    setDisabling(true);
    setDisableError(null);
    try {
      await api.disable2fa(disablePassword);
      setShowDisableForm(false);
      setDisablePassword("");
      await refresh();
    } catch (err) {
      setDisableError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setDisabling(false);
    }
  };

  const handleExport = async () => {
    setExportBusy(true);
    try {
      const data = await api.exportAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${BRAND.name.toLowerCase()}-export-${user.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteAccount(deletePassword);
      logout();
      navigate("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erreur");
      setDeleteBusy(false);
      setConfirmDeleteOpen(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-surface-0">
      <DashboardNav active="client" />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t("auth.account.title")}</h1>

        <div className="mt-6 rounded-xl border border-surface-border bg-surface-1 p-5">
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
                  disabled={resendBusy}
                  className="flex items-center gap-1 text-accent hover:underline disabled:opacity-40"
                >
                  <Mail size={12} />
                  {t("auth.account.profile.resendVerification")}
                </button>
              </>
            )}
          </div>
          {resendMessage && (
            <p className={`mt-1.5 text-xs ${resendMessage.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              {resendMessage.text}
            </p>
          )}

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
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSaveProfile()}
                className="w-full flex-1 rounded-lg border border-surface-border bg-surface-0 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
              />
              <button
                onClick={handleSaveProfile}
                disabled={profileBusy || displayName.trim() === user.display_name}
                className="rounded-lg bg-accent px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-accent-hover disabled:opacity-40"
              >
                {t("auth.account.profile.save")}
              </button>
            </div>
            {profileMessage && (
              <p className={`mt-1.5 text-xs ${profileMessage.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                {profileMessage.text}
              </p>
            )}
          </div>
        </div>

        <h2 className="mt-8 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t("auth.account.usage.title")}
        </h2>

        {stats && (
          <div className="mt-3 rounded-xl border border-surface-border bg-surface-1 p-5">
            <div className="flex items-center gap-2">
              <HardDrive size={15} className="text-slate-500 dark:text-slate-400" />
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
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{
                      width: `${Math.min(100, (stats.storage_bytes / stats.storage_limit_bytes) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {stats.owned_spaces}
                  {stats.space_limit != null && <span className="text-slate-400"> / {stats.space_limit}</span>}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t("auth.account.usage.spaces")}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{stats.document_count}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t("auth.account.usage.documents")}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{stats.conversation_count}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t("auth.account.usage.conversations")}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {stats.messages_today ?? 0}
                  {stats.messages_per_day_limit != null && (
                    <span className="text-slate-400"> / {stats.messages_per_day_limit}</span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t("auth.account.usage.questionsToday")}</p>
              </div>
            </div>
          </div>
        )}

        <h2 className="mt-8 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t("auth.account.security")}
        </h2>

        <div className="mt-3 rounded-xl border border-surface-border bg-surface-1 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <LogOut size={15} className="text-slate-500 dark:text-slate-400" />
              <span className="text-sm text-slate-800 dark:text-slate-200">{t("auth.account.logoutEverywhere")}</span>
            </div>
            <button
              onClick={handleLogoutEverywhere}
              disabled={logoutBusy}
              className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-surface-3 disabled:opacity-40"
            >
              {t("auth.account.logoutEverywhere")}
            </button>
          </div>
          {logoutDone && (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
              {t("auth.account.logoutEverywhereDone")}
            </p>
          )}
        </div>

        <div className="mt-3 rounded-xl border border-surface-border bg-surface-1 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <KeyRound size={15} className="text-slate-500 dark:text-slate-400" />
              <span className="text-sm text-slate-800 dark:text-slate-200">{t("auth.account.password.title")}</span>
            </div>
            {!showPasswordForm && (
              <button
                onClick={() => {
                  setShowPasswordForm(true);
                  setPasswordDone(false);
                }}
                className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-surface-3"
              >
                {t("auth.account.password.title")}
              </button>
            )}
          </div>
          {passwordDone && (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{t("auth.account.password.changed")}</p>
          )}
          {showPasswordForm && (
            <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
              <div>
                <label htmlFor="account-current-password" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t("auth.account.password.current")}
                </label>
                <input
                  id="account-current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-surface-border bg-surface-0 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
                />
              </div>
              <div>
                <label htmlFor="account-new-password" className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t("auth.account.password.new")}
                </label>
                <input
                  id="account-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
                  className="mt-1.5 w-full rounded-lg border border-surface-border bg-surface-0 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
                />
                <PasswordStrengthMeter password={newPassword} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("auth.account.password.ssoHint")}</p>
              {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleChangePassword}
                  disabled={!currentPassword || newPassword.length < 8 || passwordBusy}
                  className="flex-1 rounded-lg bg-accent px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-accent-hover disabled:opacity-40"
                >
                  {t("auth.account.password.title")}
                </button>
                <button
                  onClick={() => {
                    setShowPasswordForm(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setPasswordError(null);
                  }}
                  className="rounded-lg px-3 py-2 text-xs text-slate-600 dark:text-slate-400 hover:bg-surface-3"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 rounded-xl border border-surface-border bg-surface-1 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {user.totp_enabled ? (
                <ShieldCheck size={15} className="text-emerald-500" />
              ) : (
                <ShieldOff size={15} className="text-slate-500 dark:text-slate-400" />
              )}
              <div>
                <p className="text-sm text-slate-800 dark:text-slate-200">{t("auth.account.twofaTitle")}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {user.totp_enabled ? t("auth.account.twofaEnabled") : t("auth.account.twofaDisabled")}
                </p>
              </div>
            </div>
            {!user.totp_enabled && !setup && (
              <button
                onClick={startTwoFactorSetup}
                className="rounded-lg bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-accent-hover"
              >
                {t("auth.account.twofaEnable")}
              </button>
            )}
            {user.totp_enabled && !showDisableForm && (
              <button
                onClick={() => setShowDisableForm(true)}
                className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-surface-3"
              >
                {t("auth.account.twofaDisable")}
              </button>
            )}
          </div>

          {setup && (
            <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("auth.account.twofaSetupHint")}</p>
              <div className="rounded-lg border border-surface-border bg-surface-0 p-3">
                <p className="break-all font-mono text-xs text-slate-800 dark:text-slate-200">{setup.secret}</p>
              </div>
              <input
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && confirmTwoFactorEnable()}
                placeholder={t("auth.twofa.hint")}
                className="w-full rounded-lg border border-surface-border bg-surface-0 px-3 py-2 text-center font-mono text-lg tracking-[0.4em] text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
                maxLength={6}
                inputMode="numeric"
              />
              {setupError && <p className="text-xs text-red-500">{setupError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={confirmTwoFactorEnable}
                  disabled={setupCode.length !== 6 || setupBusy}
                  className="flex-1 rounded-lg bg-accent px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-accent-hover disabled:opacity-40"
                >
                  {t("auth.account.twofaConfirm")}
                </button>
                <button
                  onClick={() => {
                    setSetup(null);
                    setSetupCode("");
                  }}
                  className="rounded-lg px-3 py-2 text-xs text-slate-600 dark:text-slate-400 hover:bg-surface-3"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}

          {showDisableForm && (
            <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("auth.account.twofaDisablePasswordHint")}</p>
              <input
                type="password"
                aria-label={t("auth.account.twofaPasswordLabel")}
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmTwoFactorDisable()}
                className="w-full rounded-lg border border-surface-border bg-surface-0 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
              />
              {disableError && <p className="text-xs text-red-500">{disableError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={confirmTwoFactorDisable}
                  disabled={!disablePassword || disabling}
                  className="flex-1 rounded-lg bg-red-600 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-red-500 disabled:opacity-40"
                >
                  {t("auth.account.twofaDisable")}
                </button>
                <button
                  onClick={() => {
                    setShowDisableForm(false);
                    setDisablePassword("");
                  }}
                  className="rounded-lg px-3 py-2 text-xs text-slate-600 dark:text-slate-400 hover:bg-surface-3"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>

        <h2 className="mt-8 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t("auth.account.gdpr.title")}
        </h2>
        <div className="mt-3 rounded-xl border border-surface-border bg-surface-1 p-5">
          <div className="flex items-start gap-2">
            <Scale size={15} className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("auth.account.gdpr.hint")}{" "}
              <Link to="/confidentialite/" className="text-accent hover:underline">
                {t("auth.account.gdpr.privacyLink")}
              </Link>
              .
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-surface-border pt-4">
            <div className="flex items-center gap-2">
              <Download size={15} className="text-slate-500 dark:text-slate-400" />
              <span className="text-sm text-slate-800 dark:text-slate-200">{t("auth.account.exportData")}</span>
            </div>
            <button
              onClick={handleExport}
              disabled={exportBusy}
              className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-surface-3 disabled:opacity-40"
            >
              {t("auth.account.exportData")}
            </button>
          </div>
        </div>

        <h2 className="mt-8 font-mono text-xs font-semibold uppercase tracking-wider text-red-500">
          {t("auth.account.dangerZone")}
        </h2>

        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <div className="flex items-center gap-2">
            <Trash2 size={15} className="text-red-500" />
            <span className="text-sm text-slate-800 dark:text-slate-200">{t("auth.account.deleteAccount")}</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t("auth.account.deleteAccountWarning")}</p>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t("auth.account.deleteAccountConfirm")}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="relative flex-1">
              <KeyRound
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="password"
                aria-label={t("auth.account.deletePasswordLabel")}
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-0 py-2 pl-8 pr-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-red-400"
              />
            </div>
            <button
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={!deletePassword}
              className="rounded-lg bg-red-600 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-red-500 disabled:opacity-40"
            >
              {t("auth.account.deleteAccount")}
            </button>
          </div>
          {deleteError && <p className="mt-2 text-xs text-red-500">{deleteError}</p>}
        </div>
      </main>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={t("auth.account.deleteAccount")}
        message={t("auth.account.deleteAccountWarning")}
        confirmLabel={deleteBusy ? t("common.loading") : t("common.delete")}
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
