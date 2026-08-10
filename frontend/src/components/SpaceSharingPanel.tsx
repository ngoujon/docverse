import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Eye, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import clsx from "clsx";
import { api } from "../api/client";
import { useEscapeToClose } from "../hooks/useEscapeToClose";
import type { Space, ShareLink, SpaceMember } from "../types";

interface Props {
  open: boolean;
  space: Space | null;
  onClose: () => void;
}

function RoleBadge({ role }: { role: "editor" | "viewer" }) {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        "flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        role === "editor" ? "bg-accent/15 text-accent" : "bg-surface-3 text-slate-600 dark:text-slate-300"
      )}
    >
      {role === "editor" ? <Pencil size={10} /> : <Eye size={10} />}
      {role === "editor" ? t("app.sharing.editor") : t("app.sharing.viewer")}
    </span>
  );
}

export default function SpaceSharingPanel({ open, space, onClose }: Props) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"editor" | "viewer">("viewer");
  const [memberError, setMemberError] = useState<string | null>(null);

  const [linkRole, setLinkRole] = useState<"editor" | "viewer">("viewer");
  const [linkLabel, setLinkLabel] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !space) return;
    setLoading(true);
    Promise.all([api.listMembers(space.id), api.listShareLinks(space.id)])
      .then(([m, l]) => {
        setMembers(m);
        setLinks(l);
      })
      .finally(() => setLoading(false));
  }, [open, space]);

  useEscapeToClose(open, onClose);

  if (!open || !space) return null;

  const handleAddMember = async () => {
    if (!memberEmail.trim()) return;
    setMemberError(null);
    try {
      const member = await api.addMember(space.id, memberEmail.trim(), memberRole);
      setMembers((prev) => [...prev.filter((m) => m.id !== member.id), member]);
      setMemberEmail("");
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleRemoveMember = async (id: string) => {
    await api.removeMember(space.id, id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleCreateLink = async () => {
    const link = await api.createShareLink(space.id, linkRole, linkLabel.trim());
    setLinks((prev) => [link, ...prev]);
    setLinkLabel("");
  };

  const handleRevokeLink = async (id: string) => {
    await api.revokeShareLink(space.id, id);
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, revoked: true } : l)));
  };

  const shareUrl = (id: string) => `${window.location.origin}/share/${id}`;

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(id));
    } catch {
      window.prompt("URL:", shareUrl(id));
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-surface-border bg-surface-2 p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sharing-panel-title"
      >
        <div className="flex items-center justify-between">
          <h3 id="sharing-panel-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("app.sharing.title", { name: space.name })}
          </h3>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
        ) : (
          <>
            {/* Share links */}
            <section className="mt-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t("app.sharing.linksTitle")}
              </h4>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t("app.sharing.linksHelp")}</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  placeholder={t("app.sharing.labelPlaceholder")}
                  className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-1 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
                />
                <select
                  value={linkRole}
                  onChange={(e) => setLinkRole(e.target.value as "editor" | "viewer")}
                  className="rounded-lg border border-surface-border bg-surface-1 px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
                >
                  <option value="viewer">{t("app.sharing.viewer")}</option>
                  <option value="editor">{t("app.sharing.editor")}</option>
                </select>
                <button
                  onClick={handleCreateLink}
                  className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-accent-hover"
                >
                  <Plus size={12} /> {t("app.sharing.createLink")}
                </button>
              </div>

              <div className="mt-3 space-y-1.5">
                {links.length === 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("app.sharing.noLinks")}</p>
                )}
                {links.map((l) => (
                  <div
                    key={l.id}
                    className={clsx(
                      "flex items-center gap-2 rounded-lg border border-surface-border bg-surface-1 px-3 py-2",
                      l.revoked && "opacity-50"
                    )}
                  >
                    <RoleBadge role={l.role} />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-300">
                      {l.label || t("app.sharing.unnamedLink")}
                    </span>
                    {l.revoked ? (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{t("app.sharing.revoked")}</span>
                    ) : (
                      <>
                        <button
                          onClick={() => copyLink(l.id)}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-600 dark:text-slate-400 hover:bg-surface-3"
                        >
                          {copiedId === l.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                          {t("app.sharing.copy")}
                        </button>
                        <button
                          onClick={() => handleRevokeLink(l.id)}
                          aria-label={t("common.delete")}
                          className="rounded-md p-1 text-slate-500 dark:text-slate-400 hover:text-red-500"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Members */}
            <section className="mt-6">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t("app.sharing.membersTitle")}
              </h4>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t("app.sharing.membersHelp")}</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
                  type="email"
                  placeholder={t("app.sharing.emailPlaceholder")}
                  className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-1 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
                />
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value as "editor" | "viewer")}
                  className="rounded-lg border border-surface-border bg-surface-1 px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
                >
                  <option value="viewer">{t("app.sharing.viewer")}</option>
                  <option value="editor">{t("app.sharing.editor")}</option>
                </select>
                <button
                  onClick={handleAddMember}
                  className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-accent-hover"
                >
                  <UserPlus size={12} /> {t("app.sharing.addMember")}
                </button>
              </div>
              {memberError && <p className="mt-1.5 text-xs text-red-500">{memberError}</p>}

              <div className="mt-3 space-y-1.5">
                {members.length === 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("app.sharing.noMembers")}</p>
                )}
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-1 px-3 py-2"
                  >
                    <RoleBadge role={m.role} />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-300">
                      {m.display_name || m.email}
                    </span>
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      aria-label={t("common.delete")}
                      className="rounded-md p-1 text-slate-500 dark:text-slate-400 hover:text-red-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
