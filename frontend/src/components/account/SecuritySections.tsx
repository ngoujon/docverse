/** Account settings: sessions, password and two-factor authentication. */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, LogOut, ShieldCheck, ShieldOff } from "lucide-react";
import { api } from "../../api/client";
import { setUserToken } from "../../api/storage";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import PasswordStrengthMeter from "../ui/PasswordStrengthMeter";
import { buttonOutline } from "../ui/controls";
import type { TwoFactorSetup, User } from "../../types";
import { cardClass, CardRow, Feedback, FormButtons, iconMuted, input, muted, smallPrimary } from "./AccountCard";

/** Invalidates every other session; this tab gets a fresh token. */
export function LogoutEverywhereCard() {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  const { busy, run } = useAsyncAction();

  const handleLogoutEverywhere = () =>
    run(async () => {
      const res = await api.logoutEverywhere();
      setUserToken(res.access_token);
      setDone(true);
    });

  return (
    <div className={`mt-3 ${cardClass}`}>
      <CardRow
        icon={<LogOut size={15} className={iconMuted} />}
        label={t("auth.account.logoutEverywhere")}
        action={
          <button onClick={handleLogoutEverywhere} disabled={busy} className={buttonOutline}>
            {t("auth.account.logoutEverywhere")}
          </button>
        }
      />
      {done && <Feedback ok text={t("auth.account.logoutEverywhereDone")} className="mt-2" />}
    </div>
  );
}

/** Password change (also signs out the other sessions). */
export function PasswordCard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, setError, run } = useAsyncAction();
  const canSubmit = !!currentPassword && newPassword.length >= 8 && !busy;

  const close = () => {
    setOpen(false);
    setCurrentPassword("");
    setNewPassword("");
  };

  const handleChangePassword = async () => {
    if (!canSubmit) return;
    const ok = await run(async () => {
      const res = await api.changePassword(currentPassword, newPassword);
      setUserToken(res.access_token);
    });
    if (ok) {
      close();
      setDone(true);
    }
  };

  return (
    <div className={`mt-3 ${cardClass}`}>
      <CardRow
        icon={<KeyRound size={15} className={iconMuted} />}
        label={t("auth.account.password.title")}
        action={
          !open && (
            <button
              onClick={() => {
                setOpen(true);
                setDone(false);
              }}
              className={buttonOutline}
            >
              {t("auth.account.password.title")}
            </button>
          )
        }
      />
      {done && <Feedback ok text={t("auth.account.password.changed")} className="mt-2" />}
      {open && (
        <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
          <div>
            <label
              htmlFor="account-current-password"
              className="text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              {t("auth.account.password.current")}
            </label>
            <input
              id="account-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={`mt-1.5 ${input}`}
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
              className={`mt-1.5 ${input}`}
            />
            <PasswordStrengthMeter password={newPassword} />
          </div>
          <p className={muted}>{t("auth.account.password.ssoHint")}</p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <FormButtons
            label={t("auth.account.password.title")}
            onSubmit={handleChangePassword}
            onCancel={() => {
              close();
              setError(null);
            }}
            disabled={!canSubmit}
          />
        </div>
      )}
    </div>
  );
}

/** Optional TOTP two-factor authentication: setup (secret + code) or disable. */
export function TwoFactorCard({ user, refresh }: { user: User; refresh: () => Promise<void> }) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const enable = useAsyncAction();
  const disable = useAsyncAction();

  const startSetup = async () => {
    enable.setError(null);
    setSetup(await api.setup2fa());
  };

  const confirmEnable = async () => {
    if (setupCode.length !== 6) return;
    const ok = await enable.run(async () => {
      await api.enable2fa(setupCode);
      await refresh();
    });
    if (ok) {
      setSetup(null);
      setSetupCode("");
    }
  };

  const confirmDisable = async () => {
    if (!disablePassword) return;
    const ok = await disable.run(async () => {
      await api.disable2fa(disablePassword);
      await refresh();
    });
    if (ok) {
      setShowDisableForm(false);
      setDisablePassword("");
    }
  };

  return (
    <div className={`mt-3 ${cardClass}`}>
      <CardRow
        icon={
          user.totp_enabled ? (
            <ShieldCheck size={15} className="text-emerald-500" />
          ) : (
            <ShieldOff size={15} className={iconMuted} />
          )
        }
        label={
          <div>
            <p className="text-sm text-slate-800 dark:text-slate-200">{t("auth.account.twofaTitle")}</p>
            <p className={muted}>
              {user.totp_enabled ? t("auth.account.twofaEnabled") : t("auth.account.twofaDisabled")}
            </p>
          </div>
        }
        action={
          <>
            {!user.totp_enabled && !setup && (
              <button onClick={startSetup} className={smallPrimary}>
                {t("auth.account.twofaEnable")}
              </button>
            )}
            {user.totp_enabled && !showDisableForm && (
              <button onClick={() => setShowDisableForm(true)} className={buttonOutline}>
                {t("auth.account.twofaDisable")}
              </button>
            )}
          </>
        }
      />

      {setup && (
        <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
          <p className={muted}>{t("auth.account.twofaSetupHint")}</p>
          <div className="rounded-lg border border-surface-border bg-surface-0 p-3">
            <p className="break-all font-mono text-xs text-slate-800 dark:text-slate-200">{setup.secret}</p>
          </div>
          <input
            value={setupCode}
            onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && confirmEnable()}
            placeholder={t("auth.twofa.hint")}
            className="w-full rounded-lg border border-surface-border bg-surface-0 px-3 py-2 text-center font-mono text-lg tracking-[0.4em] text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
            maxLength={6}
            inputMode="numeric"
          />
          {enable.error && <p className="text-xs text-red-500">{enable.error}</p>}
          <FormButtons
            label={t("auth.account.twofaConfirm")}
            onSubmit={confirmEnable}
            onCancel={() => {
              setSetup(null);
              setSetupCode("");
            }}
            disabled={setupCode.length !== 6 || enable.busy}
          />
        </div>
      )}

      {showDisableForm && (
        <div className="mt-4 space-y-3 border-t border-surface-border pt-4">
          <p className={muted}>{t("auth.account.twofaDisablePasswordHint")}</p>
          <input
            type="password"
            aria-label={t("auth.account.twofaPasswordLabel")}
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmDisable()}
            className={input}
          />
          {disable.error && <p className="text-xs text-red-500">{disable.error}</p>}
          <FormButtons
            label={t("auth.account.twofaDisable")}
            onSubmit={confirmDisable}
            onCancel={() => {
              setShowDisableForm(false);
              setDisablePassword("");
            }}
            disabled={!disablePassword || disable.busy}
            danger
          />
        </div>
      )}
    </div>
  );
}
