import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Send, CheckCircle2, AlertCircle } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { useCaptcha } from "../../hooks/useCaptcha";
import { trackConversion } from "../../utils/seoMonitor";

const retroInput =
  "w-full rounded-lg border border-fluent-line bg-white px-3 py-2.5 text-sm text-fluent-navy shadow-card placeholder:text-slate-400 outline-none transition focus:border-fluent-indigo focus:shadow-focus";

function RetroField({ label, optional, children }: { label: string; optional?: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-fluent-navy">
        {label}
        {optional && (
          <>
            {" "}
            <span className="font-normal text-fluent-muted">({t("contact.optional")})</span>
          </>
        )}
      </label>
      {children}
    </div>
  );
}

/** Landing page contact form: honeypot field + invisible captcha + the
 * backend's own rate limit keep bots out without bothering humans. */
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
  const { solution: captcha, reset: resetCaptcha } = useCaptcha();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim() && email.trim() && subject.trim() && message.trim() && consent && captcha;

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
      trackConversion("Contact");
      setName("");
      setEmail("");
      setSubject("");
      setPhone("");
      setCompany("");
      setMessage("");
      setConsent(false);
    } catch (err) {
      setStatus("error");
      setError(errorMessage(err, t("contact.genericError")));
      resetCaptcha();
    }
  };

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-fluent-green-soft">
          <CheckCircle2 size={26} className="text-fluent-green" />
        </span>
        <p className="font-semibold text-fluent-navy">{t("contact.sentTitle")}</p>
        <p className="text-sm text-fluent-text">{t("contact.sentDesc")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        <RetroField label={t("contact.name")}>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("contact.namePlaceholder")}
            className={retroInput}
          />
        </RetroField>
        <RetroField label={t("contact.email")}>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("contact.emailPlaceholder")}
            className={retroInput}
          />
        </RetroField>
      </div>

      <RetroField label={t("contact.subject")}>
        <input
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("contact.subjectPlaceholder")}
          className={retroInput}
        />
      </RetroField>

      <div className="grid gap-3 sm:grid-cols-2">
        <RetroField label={t("contact.company")} optional>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder={t("contact.companyPlaceholder")}
            className={retroInput}
          />
        </RetroField>
        <RetroField label={t("contact.phone")} optional>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("contact.phonePlaceholder")}
            className={retroInput}
          />
        </RetroField>
      </div>

      <RetroField label={t("contact.message")}>
        <textarea
          required
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("contact.messagePlaceholder")}
          className={`${retroInput} resize-none`}
        />
      </RetroField>

      <label className="flex items-start gap-2 text-sm text-fluent-text">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 shrink-0 accent-fluent-indigo"
        />
        <span>
          {t("contact.consent")}{" "}
          <Link
            to="/confidentialite/"
            target="_blank"
            className="font-medium text-fluent-indigo hover:text-fluent-navy"
          >
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
        className="flex w-full items-center justify-center gap-2 rounded-full bg-fluent-indigo px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-fluent-navy disabled:opacity-50 disabled:hover:bg-fluent-indigo sm:w-auto"
      >
        <Send size={14} />
        {status === "sending" ? t("contact.sending") : t("contact.send")}
      </button>
    </form>
  );
}
