import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { api } from "../api/client";
import type { BillingProfile } from "../types";

const EMPTY_PROFILE: BillingProfile = {
  is_business: false,
  company_name: "",
  siret: "",
  vat_number: "",
  address_line1: "",
  address_line2: "",
  postal_code: "",
  city: "",
  country_code: "FR",
};

export default function BillingProfileForm() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .billingProfile()
      .then(setProfile)
      .catch(() => setProfile(EMPTY_PROFILE))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !profile) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Loader2 size={14} className="animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  const update = (patch: Partial<BillingProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateBillingProfile(profile);
      setProfile(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.account.billingProfile.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-surface-border bg-surface-0 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-accent";
  const labelClass = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex overflow-hidden rounded-lg border border-surface-border text-xs font-medium">
        <button
          type="button"
          onClick={() => update({ is_business: false })}
          className={`flex-1 px-3 py-2 transition ${
            !profile.is_business
              ? "bg-accent text-white"
              : "bg-surface-0 text-slate-600 hover:bg-surface-3 dark:text-slate-400"
          }`}
        >
          {t("auth.account.billingProfile.individual")}
        </button>
        <button
          type="button"
          onClick={() => update({ is_business: true })}
          className={`flex-1 px-3 py-2 transition ${
            profile.is_business
              ? "bg-accent text-white"
              : "bg-surface-0 text-slate-600 hover:bg-surface-3 dark:text-slate-400"
          }`}
        >
          {t("auth.account.billingProfile.business")}
        </button>
      </div>

      {profile.is_business && (
        <div className="space-y-3 rounded-lg border border-surface-border bg-surface-0 p-3">
          <div>
            <label className={labelClass}>{t("auth.account.billingProfile.companyName")} *</label>
            <input
              className={inputClass}
              value={profile.company_name}
              onChange={(e) => update({ company_name: e.target.value })}
              required={profile.is_business}
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t("auth.account.billingProfile.siret")} *</label>
              <input
                className={inputClass}
                value={profile.siret}
                onChange={(e) => update({ siret: e.target.value })}
                required={profile.is_business}
                maxLength={20}
                placeholder="123 456 789 00012"
              />
            </div>
            <div>
              <label className={labelClass}>{t("auth.account.billingProfile.vatNumber")}</label>
              <input
                className={inputClass}
                value={profile.vat_number}
                onChange={(e) => update({ vat_number: e.target.value })}
                maxLength={20}
                placeholder="FR40123456789"
              />
            </div>
          </div>
        </div>
      )}

      <div>
        <label className={labelClass}>{t("auth.account.billingProfile.addressLine1")} {profile.is_business ? "*" : ""}</label>
        <input
          className={inputClass}
          value={profile.address_line1}
          onChange={(e) => update({ address_line1: e.target.value })}
          required={profile.is_business}
          maxLength={200}
        />
      </div>
      <div>
        <label className={labelClass}>{t("auth.account.billingProfile.addressLine2")}</label>
        <input
          className={inputClass}
          value={profile.address_line2}
          onChange={(e) => update({ address_line2: e.target.value })}
          maxLength={200}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>{t("auth.account.billingProfile.postalCode")} {profile.is_business ? "*" : ""}</label>
          <input
            className={inputClass}
            value={profile.postal_code}
            onChange={(e) => update({ postal_code: e.target.value })}
            required={profile.is_business}
            maxLength={20}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>{t("auth.account.billingProfile.city")} {profile.is_business ? "*" : ""}</label>
          <input
            className={inputClass}
            value={profile.city}
            onChange={(e) => update({ city: e.target.value })}
            required={profile.is_business}
            maxLength={120}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {saved && !error && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">{t("auth.account.billingProfile.saved")}</p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-accent-hover disabled:opacity-40"
      >
        {saving && <Loader2 size={12} className="animate-spin" />}
        {t("auth.account.billingProfile.save")}
      </button>
    </form>
  );
}
