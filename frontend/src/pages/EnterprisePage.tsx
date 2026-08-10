import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Send, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../api/client";
import { useCaptchaSolution } from "../hooks/useCaptchaSolution";

export default function EnterprisePage() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [teamSize, setTeamSize] = useState(0);
  const [needs, setNeeds] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const { solution: captcha, reset: resetCaptcha } = useCaptchaSolution();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const teamSizeOptions = t("enterprise.teamSizeOptions", { returnObjects: true }) as string[];

  usePageMeta({
    title: `${t("enterprise.title")} - Open RAG`,
    description: t("enterprise.subtitle"),
    canonicalPath: "/entreprise",
  });

  const canSubmit = name.trim() && email.trim() && company.trim() && needs.trim() && consent && captcha;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !captcha) return;
    setStatus("sending");
    setError(null);
    try {
      await api.submitContact({
        name: name.trim(),
        email: email.trim(),
        subject: "Demande de devis - Entreprise",
        phone: phone.trim(),
        company: company.trim(),
        message: `${t("enterprise.messagePrefix")} : ${teamSizeOptions[teamSize]}\n\n${needs.trim()}`,
        consent,
        website,
        captcha,
      });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : t("contact.genericError"));
      resetCaptcha();
    }
  };

  return (
    <div className="min-h-screen bg-retro-bg px-4 py-12 font-sans text-slate-800 sm:px-6">
      <div className="mx-auto max-w-xl">
        <Link
          to="/tarifs"
          className="mb-8 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-slate-600 hover:text-retro-cyan"
        >
          <ArrowLeft size={14} /> {t("enterprise.back")}
        </Link>

        <div className="text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-retro-purple/10 text-retro-purple">
            <Building2 size={20} />
          </div>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.3em] text-retro-pink">
            {t("enterprise.eyebrow")}
          </p>
          <h1
            className="mt-2 whitespace-nowrap font-bold text-slate-900"
            style={{ fontSize: "clamp(1.05rem, 4.8vw, 1.875rem)" }}
          >
            {t("enterprise.title")}
          </h1>
          <p className="mt-3 text-sm text-slate-600">{t("enterprise.subtitle")}</p>
        </div>

        {status === "sent" ? (
          <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-retro-cyan/30 bg-retro-panel/60 px-6 py-10 text-center">
            <CheckCircle2 size={32} className="text-retro-cyan" />
            <p className="font-mono text-sm text-slate-800">{t("enterprise.sentTitle")}</p>
            <p className="text-xs text-slate-600">{t("enterprise.sentDesc")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-3 rounded-2xl border border-retro-border bg-retro-panel/40 p-6">
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-retro-cyan/80">
                  {t("contact.name")}
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-retro-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-retro-cyan"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-retro-cyan/80">
                  {t("contact.email")}
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-retro-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-retro-cyan"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-retro-cyan/80">
                  {t("contact.company")}
                </label>
                <input
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded-lg border border-retro-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-retro-cyan"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-retro-cyan/80">
                  {t("contact.phone")}{" "}
                  <span className="normal-case tracking-normal text-slate-400">({t("contact.optional")})</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-retro-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-retro-cyan"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-retro-cyan/80">
                {t("enterprise.teamSize")}
              </label>
              <select
                value={teamSize}
                onChange={(e) => setTeamSize(Number(e.target.value))}
                className="w-full rounded-lg border border-retro-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-retro-cyan"
              >
                {teamSizeOptions.map((opt, i) => (
                  <option key={opt} value={i}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-retro-cyan/80">
                {t("enterprise.needs")}
              </label>
              <textarea
                required
                rows={4}
                value={needs}
                onChange={(e) => setNeeds(e.target.value)}
                placeholder={t("enterprise.needsPlaceholder")}
                className="w-full resize-none rounded-lg border border-retro-border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-retro-cyan"
              />
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 shrink-0 accent-retro-pink"
              />
              <span>
                {t("contact.consent")}{" "}
                <Link to="/confidentialite" target="_blank" className="text-retro-cyan hover:underline">
                  {t("contact.consentLink")}
                </Link>
              </span>
            </label>

            {status === "error" && (
              <p className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle size={13} /> {error}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "sending" || !canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-retro-pink bg-retro-pink/10 px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-retro-pink transition hover:bg-retro-pink hover:text-white disabled:opacity-50"
            >
              <Send size={14} />
              {status === "sending" ? t("contact.sending") : t("enterprise.send")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
