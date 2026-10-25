import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Link2, Send, X } from "lucide-react";
import clsx from "clsx";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import type { DemoSpace } from "./types";
import { BRAND } from "../../brand";

type Role = "editor" | "viewer";

interface Member {
  name: string;
  initials: string;
  email: string;
  role: "owner" | Role;
}

/** Simulated sharing dialog: members, role-based invite and share link.
 * Nothing is sent anywhere - it only shows how access works. */
export default function DemoSharePanel({ space, onClose }: { space: DemoSpace; onClose: () => void }) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<Member[]>([
    { name: `Camille Martin (${t("demoApp.ui.you")})`, initials: "CM", email: "camille@docverse.fr", role: "owner" },
    { name: "Claire Morel", initials: "CL", email: "c.morel@client.fr", role: "viewer" },
  ]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [linkRole, setLinkRole] = useState<Role>("viewer");
  const [notice, setNotice] = useState<string | null>(null);

  useEscapeToClose(true, onClose);

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 2200);
  };

  const invite = () => {
    const value = email.trim();
    if (!/\S+@\S+\.\S+/.test(value)) return;
    const name = value.split("@")[0];
    setMembers((prev) => [...prev, { name, initials: name.slice(0, 2), email: value, role }]);
    setEmail("");
    flash(t("demoApp.ui.invited"));
  };

  const roleLabel = (r: Member["role"]) =>
    t(r === "owner" ? "demoApp.ui.roleOwner" : r === "editor" ? "demoApp.ui.roleEditor" : "demoApp.ui.roleViewer");

  return (
    <div
      className="absolute inset-0 z-30 flex items-end justify-center bg-slate-900/40 p-3 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("demoApp.ui.shareTitle", { space: space.name })}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-xl border border-fluent-line bg-white p-5 shadow-card-lg sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-fluent-navy">
              {t("demoApp.ui.shareTitle", { space: space.name })}
            </h3>
            <p className="mt-1 text-sm text-fluent-text">{t("demoApp.ui.shareDesc")}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("demoApp.ui.close")}
            className="text-fluent-muted hover:text-fluent-navy"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invite()}
            placeholder={t("demoApp.ui.invitePlaceholder")}
            className="min-w-0 flex-1 rounded-lg border border-fluent-line px-3 py-2 text-sm text-fluent-navy shadow-card outline-none placeholder:text-slate-400 focus:border-fluent-indigo focus:shadow-focus"
          />
          <div className="flex gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="flex-1 rounded-lg border border-fluent-line bg-white px-2 py-2 text-sm text-fluent-navy shadow-card outline-none focus:border-fluent-indigo"
            >
              <option value="editor">{t("demoApp.ui.roleEditor")}</option>
              <option value="viewer">{t("demoApp.ui.roleViewer")}</option>
            </select>
            <button
              onClick={invite}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-fluent-indigo px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-fluent-navy"
            >
              <Send size={14} /> {t("demoApp.ui.invite")}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-fluent-muted">
          {role === "editor" ? t("demoApp.ui.roleEditorDesc") : t("demoApp.ui.roleViewerDesc")}
        </p>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-fluent-muted">
          {t("demoApp.ui.members")}
        </p>
        <ul className="mt-2 divide-y divide-fluent-line rounded-lg border border-fluent-line">
          {members.map((m) => (
            <li key={m.email} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fluent-indigo-soft text-xs font-semibold uppercase text-fluent-indigo-dark">
                {m.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fluent-navy">{m.name}</p>
                <p className="truncate text-xs text-fluent-muted">{m.email}</p>
              </div>
              <span
                className={clsx(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  m.role === "owner" ? "bg-fluent-indigo-soft text-fluent-indigo-dark" : "bg-slate-100 text-slate-600",
                )}
              >
                {roleLabel(m.role)}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-fluent-muted">
          {t("demoApp.ui.linkTitle")}
        </p>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-fluent-line bg-fluent-soft p-2 pl-3">
          <Link2 size={15} className="shrink-0 text-fluent-muted" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-fluent-text">
            {BRAND.domain}/share/{linkRole === "editor" ? "e" : "v"}-7f3k9q
          </span>
          <select
            value={linkRole}
            onChange={(e) => setLinkRole(e.target.value as Role)}
            className="rounded-md border border-fluent-line bg-white px-1.5 py-1 text-xs text-fluent-navy outline-none"
            aria-label={t("demoApp.ui.linkTitle")}
          >
            <option value="viewer">{t("demoApp.ui.roleViewer")}</option>
            <option value="editor">{t("demoApp.ui.roleEditor")}</option>
          </select>
          <button
            onClick={() => flash(t("demoApp.ui.linkCopied"))}
            className="flex items-center gap-1 whitespace-nowrap rounded-md bg-white px-2 py-1 text-xs font-semibold text-fluent-navy shadow-card ring-1 ring-fluent-line hover:ring-slate-300"
          >
            <Copy size={12} /> {t("demoApp.ui.copyLink")}
          </button>
        </div>
        <p className="mt-2 text-xs text-fluent-muted">{t("demoApp.ui.revocable")}</p>

        {notice && (
          <p
            role="status"
            className="mt-4 flex items-center gap-2 rounded-lg bg-fluent-green-soft px-3 py-2 text-sm font-medium text-fluent-green animate-fade-in"
          >
            <Check size={15} /> {notice}
          </p>
        )}
      </div>
    </div>
  );
}
