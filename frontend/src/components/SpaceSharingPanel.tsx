import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Plus, Trash2, Upload, UserPlus, X } from "lucide-react";
import clsx from "clsx";
import { api } from "../api/client";
import { useEscapeToClose } from "../hooks/useEscapeToClose";
import { formatBytes } from "../utils/format";
import type { Space, ShareLink, SpaceMember, SpaceStats } from "../types";

interface Props {
  open: boolean;
  space: Space | null;
  onClose: () => void;
}

function UploadBadge({ canUpload }: { canUpload: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        "flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        canUpload ? "bg-accent/15 text-accent" : "bg-surface-3 text-slate-600 dark:text-slate-300"
      )}
    >
      {canUpload ? <Upload size={10} /> : null}
      {canUpload ? t("app.sharing.canUpload") : t("app.sharing.chatOnly")}
    </span>
  );
}

export default function SpaceSharingPanel({ open, space, onClose }: Props) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [stats, setStats] = useState<SpaceStats | null>(null);
  const [loading, setLoading] = useState(false);

  const [memberEmail, setMemberEmail] = useState("");
  const [memberCanUpload, setMemberCanUpload] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  const [linkCanUpload, setLinkCanUpload] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !space) return;
    setLoading(true);
    Promise.all([api.listMembers(space.id), api.listShareLinks(space.id), api.spaceStats(space.id)])
      .then(([m, l, s]) => {
        setMembers(m);
        setLinks(l);
        setStats(s);
      })
      .finally(() => setLoading(false));
  }, [open, space]);

  useEscapeToClose(open, onClose);

  if (!open || !space) return null;

  const handleAddMember = async () => {
    if (!memberEmail.trim()) return;
    setMemberError(null);
    try {
      const member = await api.addMember(space.id, memberEmail.trim(), memberCanUpload);
      setMembers((prev) => [...prev.filter((m) => m.id !== member.id), member]);
      setMemberEmail("");
      api.spaceStats(space.id).then(setStats);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleRemoveMember = async (id: string) => {
    await api.removeMember(space.id, id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
    api.spaceStats(space.id).then(setStats);
  };

  const handleCreateLink = async () => {
    const link = await api.createShareLink(space.id, linkCanUpload, linkLabel.trim());
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
            {stats && (
              <div className="mt-4 rounded-lg border border-surface-border bg-surface-1 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t("app.sharing.storageTitle")}
                  </span>
                  <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                    {formatBytes(stats.storage_bytes)}
                    {stats.storage_limit_bytes != null && ` / ${formatBytes(stats.storage_limit_bytes)}`}
                  </span>
                </div>
                {stats.storage_limit_bytes != null && (
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={clsx(
                        "h-full rounded-full",
                        stats.storage_bytes / stats.storage_limit_bytes >= 0.9 ? "bg-amber-500" : "bg-accent"
                      )}
                      style={{ width: `${Math.min(1, stats.storage_bytes / stats.storage_limit_bytes) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            )}

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
                <label className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={linkCanUpload}
                    onChange={(e) => setLinkCanUpload(e.target.checked)}
                    className="accent-accent"
                  />
                  {t("app.sharing.canUploadLabel")}
                </label>
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
                    <UploadBadge canUpload={l.can_upload} />
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
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t("app.sharing.membersTitle")}
                </h4>
                {stats?.member_limit != null && (
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {stats.member_count} / {stats.member_limit}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t("app.sharing.membersHelp")}</p>
              {stats?.member_limit != null && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={clsx(
                      "h-full rounded-full",
                      stats.member_count / stats.member_limit >= 0.9 ? "bg-amber-500" : "bg-accent"
                    )}
                    style={{ width: `${Math.min(1, stats.member_count / stats.member_limit) * 100}%` }}
                  />
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
                  type="email"
                  placeholder={t("app.sharing.emailPlaceholder")}
                  className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-1 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
                />
                <label className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={memberCanUpload}
                    onChange={(e) => setMemberCanUpload(e.target.checked)}
                    className="accent-accent"
                  />
                  {t("app.sharing.canUploadLabel")}
                </label>
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
                    <UploadBadge canUpload={m.can_upload} />
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
