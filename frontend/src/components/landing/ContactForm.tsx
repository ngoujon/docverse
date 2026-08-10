import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Send, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "../../api/client";
import { useCaptchaSolution } from "../../hooks/useCaptchaSolution";

export default function ContactForm() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const { solution: captcha, reset: resetCaptcha } = useCaptchaSolution();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim() && email.trim() && subject.trim() && message.trim() && consent && captcha;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !captcha) return;
    setStatus("sending");
    setError(null);
    try {
      await api.submitContact({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        phone: phone.trim(),
        company: company.trim(),
        message: message.trim(),
        consent,
        website,
        captcha,
      });
      setStatus("sent");
      setName("");
      setEmail("");
      setSubject("");
      setPhone("");
      setCompany("");
      setMessage("");
      setConsent(false);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : t("contact.genericError"));
      resetCaptcha();
    }
  };

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-retro-cyan/30 bg-retro-panel/60 px-6 py-10 text-center">
        <CheckCircle2 size={32} className="text-retro-cyan" />
        <p className="font-mono text-sm text-slate-800">{t("contact.sentTitle")}</p>
        <p className="text-xs text-slate-600">{t("contact.sentDesc")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Honeypot - hidden from real users, bots tend to fill every field */}
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
            placeholder={t("contact.namePlaceholder")}
            className="w-full rounded-lg border border-retro-border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-retro-cyan focus:shadow-neon"
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
            placeholder={t("contact.emailPlaceholder")}
            className="w-full rounded-lg border border-retro-border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-retro-cyan focus:shadow-neon"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-retro-cyan/80">
          {t("contact.subject")}
        </label>
        <input
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("contact.subjectPlaceholder")}
          className="w-full rounded-lg border border-retro-border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-retro-cyan focus:shadow-neon"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-retro-cyan/80">
            {t("contact.company")}{" "}
            <span className="normal-case tracking-normal text-slate-400">({t("contact.optional")})</span>
          </label>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder={t("contact.companyPlaceholder")}
            className="w-full rounded-lg border border-retro-border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-retro-cyan focus:shadow-neon"
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
            placeholder={t("contact.phonePlaceholder")}
            className="w-full rounded-lg border border-retro-border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-retro-cyan focus:shadow-neon"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-retro-cyan/80">
          {t("contact.message")}
        </label>
        <textarea
          required
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("contact.messagePlaceholder")}
          className="w-full resize-none rounded-lg border border-retro-border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-retro-cyan focus:shadow-neon"
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
        className="group flex w-full items-center justify-center gap-2 rounded-lg border border-retro-pink bg-retro-pink/10 px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-retro-pink transition hover:bg-retro-pink hover:text-white hover:shadow-neon disabled:opacity-50 sm:w-auto sm:px-6"
      >
        <Send size={14} />
        {status === "sending" ? t("contact.sending") : t("contact.send")}
      </button>
    </form>
  );
}
