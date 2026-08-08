import { useState } from "react";
import { Send, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "../../api/client";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setStatus("sending");
    setError(null);
    try {
      await api.submitContact(name.trim(), email.trim(), message.trim(), website);
      setStatus("sent");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    }
  };

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-retro-cyan/30 bg-retro-panel/60 px-6 py-10 text-center">
        <CheckCircle2 size={32} className="text-retro-cyan" />
        <p className="font-mono text-sm text-slate-200">Message envoye !</p>
        <p className="text-xs text-slate-400">On vous repond des que possible.</p>
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
            Nom
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Votre nom"
            className="w-full rounded-lg border border-retro-border bg-retro-bg/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-retro-cyan focus:shadow-neon"
          />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-retro-cyan/80">
            Email
          </label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            className="w-full rounded-lg border border-retro-border bg-retro-bg/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-retro-cyan focus:shadow-neon"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-retro-cyan/80">
          Message
        </label>
        <textarea
          required
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Une question, une idee, un bug ?"
          className="w-full resize-none rounded-lg border border-retro-border bg-retro-bg/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-retro-cyan focus:shadow-neon"
        />
      </div>

      {status === "error" && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle size={13} /> {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="group flex w-full items-center justify-center gap-2 rounded-lg border border-retro-pink bg-retro-pink/10 px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-retro-pink transition hover:bg-retro-pink hover:text-white hover:shadow-neon disabled:opacity-50 sm:w-auto sm:px-6"
      >
        <Send size={14} />
        {status === "sending" ? "Envoi..." : "Envoyer le message"}
      </button>
    </form>
  );
}
