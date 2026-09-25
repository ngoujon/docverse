import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BadgeCheck,
  BadgeX,
  CreditCard,
  Download,
  FileText,
  HardDrive,
  KeyRound,
  Loader2,
  LogOut,
  Scale,
  ShieldAlert,
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
import BillingProfileForm from "../components/BillingProfileForm";
import { formatBytes } from "../utils/format";
import type { LocalInvoice, MeStats, TwoFactorSetup } from "../types";
import { BRAND, pageTitle } from "../brand";

export default function AccountSettingsPage() {
  const { t } = useTranslation();
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  usePageMeta({ title: pageTitle(t("auth.account.title")), noindex: true });

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

  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const [stats, setStats] = useState<MeStats | null>(null);
  const [invoices, setInvoices] = useState<LocalInvoice[] | null>(null);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    api.meStats().then(setStats).catch(() => setStats(null));
    api
      .myInvoices()
      .then((res) => setInvoices(res.items))
      .catch(() => setInvoices([]));
  }, []);

  const handleDownloadInvoice = async (invoice: LocalInvoice) => {
    setDownloadingInvoiceId(invoice.id);
    try {
      await api.downloadMyInvoice(invoice.id, `facture-${invoice.number}`);
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  if (!user) return null;

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

  const handleManageBilling = async () => {
    setBillingBusy(true);
    setBillingError(null);
    try {
      const { url } = await api.billingPortal();
      window.location.href = url;
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : t("auth.account.billingError"));
      setBillingBusy(false);
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
          <p className="text-sm text-slate-500 dark:text-slate-400">{user.display_name}</p>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            {user.email_verified ? (
              <>
                <BadgeCheck size={14} className="text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">{t("auth.account.emailVerified")}</span>
              </>
            ) : (
              <>
                <BadgeX size={14} className="text-amber-500" />
                <span className="text-amber-600 dark:text-amber-400">{t("auth.account.emailNotVerified")}</span>
              </>
            )}
          </div>
        </div>

        <h2 className="mt-8 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t("auth.account.billingTitle")}
        </h2>

        <div className="mt-3 rounded-xl border border-surface-border bg-surface-1 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CreditCard size={15} className="text-slate-500 dark:text-slate-400" />
              <div>
                <p className="text-sm text-slate-800 dark:text-slate-200">{t("auth.account.billingCurrentPlan")}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t(`auth.account.planNames.${user.plan}`)}
                </p>
              </div>
            </div>
            {user.plan === "decouverte" ? (
              <Link
                to="/tarifs"
                className="rounded-lg bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-accent-hover"
              >
                {t("auth.account.billingUpgrade")}
              </Link>
            ) : (
              <button
                onClick={handleManageBilling}
                disabled={billingBusy}
                className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-surface-3 disabled:opacity-40"
              >
                {billingBusy && <Loader2 size={12} className="animate-spin" />}
                {t("auth.account.billingManage")}
              </button>
            )}
          </div>
          {billingError && <p className="mt-2 text-xs text-red-500">{billingError}</p>}
        </div>

        {stats && (
          <div className="mt-3 rounded-xl border border-surface-border bg-surface-1 p-5">
            <div className="flex items-center gap-2">
              <HardDrive size={15} className="text-slate-500 dark:text-slate-400" />
              <p className="text-sm text-slate-800 dark:text-slate-200">{t("auth.account.usage.title")}</p>
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
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
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
            </div>
          </div>
        )}

        <h2 className="mt-8 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t("auth.account.billingProfile.title")}
        </h2>
        <div className="mt-3 rounded-xl border border-surface-border bg-surface-1 p-5">
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            {t("auth.account.billingProfile.hint")}
          </p>
          <BillingProfileForm />
        </div>

        <h2 className="mt-8 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t("auth.account.invoices.title")}
        </h2>
        <div className="mt-3 rounded-xl border border-surface-border bg-surface-1 p-5">
          {!invoices || invoices.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("auth.account.invoices.empty")}</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {invoices.map((invoice) => (
                <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText size={14} className="shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800 dark:text-slate-200">{invoice.number}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {new Date(invoice.issue_date).toLocaleDateString()} ·{" "}
                        {(invoice.amount_ttc_cents / 100).toFixed(2)} {invoice.currency.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownloadInvoice(invoice)}
                    disabled={downloadingInvoiceId === invoice.id}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-surface-3 disabled:opacity-40"
                  >
                    {downloadingInvoiceId === invoice.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Download size={12} />
                    )}
                    {t("auth.account.invoices.download")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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

        {user.role === "admin" && !user.totp_enabled && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/50 bg-amber-50 p-4 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <p className="text-xs">{t("auth.account.twofaAdminRequired")}</p>
          </div>
        )}

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
              <Link to="/confidentialite" className="text-accent hover:underline">
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
