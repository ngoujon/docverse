import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Plus, Trash2, Upload, UserPlus } from "lucide-react";
import clsx from "clsx";
import { api, errorMessage } from "../../api/client";
import { formatBytes } from "../../utils/format";
import Modal from "../ui/Modal";
import { Badge, ProgressBar } from "../ui/controls";
import type { Space, ShareLink, SpaceMember, SpaceStats } from "../../types";

interface Props {
  open: boolean;
  space: Space | null;
  onClose: () => void;
}

const smallInput =
  "min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-1 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-accent";
const sectionTitle = "text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
const rowClass = "flex items-center gap-2 rounded-lg border border-surface-border bg-surface-1 px-3 py-2";

function UploadBadge({ canUpload }: { canUpload: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge tone={canUpload ? "accent" : "muted"} icon={canUpload ? <Upload size={10} /> : null}>
      {canUpload ? t("app.sharing.canUpload") : t("app.sharing.chatOnly")}
    </Badge>
  );
}

/** Input + "can upload" checkbox + action button, shared by both sections. */
function AddRow({
  input,
  canUpload,
  onCanUploadChange,
  onAdd,
  icon,
  label,
}: {
  input: ReactNode;
  canUpload: boolean;
  onCanUploadChange: (value: boolean) => void;
  onAdd: () => void;
  icon: ReactNode;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {input}
      <label className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={canUpload}
          onChange={(e) => onCanUploadChange(e.target.checked)}
          className="accent-accent"
        />
        {t("app.sharing.canUploadLabel")}
      </label>
      <button
        onClick={onAdd}
        className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-accent-hover"
      >
        {icon} {label}
      </button>
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      aria-label={t("common.delete")}
      className="rounded-md p-1 text-slate-500 dark:text-slate-400 hover:text-red-500"
    >
      <Trash2 size={13} />
    </button>
  );
}

/** Owner-only panel: storage usage, share links and invited members. */
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

  if (!space) return null;

  // Member count drives the headcount bar, so refresh stats after changes.
  const refreshStats = () => api.spaceStats(space.id).then(setStats);

  const handleAddMember = async () => {
    if (!memberEmail.trim()) return;
    setMemberError(null);
    try {
      const member = await api.addMember(space.id, memberEmail.trim(), memberCanUpload);
      setMembers((prev) => [...prev.filter((m) => m.id !== member.id), member]);
      setMemberEmail("");
      refreshStats();
    } catch (err) {
      setMemberError(errorMessage(err));
    }
  };

  const handleRemoveMember = async (id: string) => {
    await api.removeMember(space.id, id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
    refreshStats();
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

  const copyLink = async (id: string) => {
    const url = `${window.location.origin}/share/${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("URL:", url);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("app.sharing.title", { name: space.name })}
      titleId="sharing-panel-title"
      className="max-h-[85vh] max-w-lg overflow-y-auto"
    >
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
                <ProgressBar ratio={stats.storage_bytes / stats.storage_limit_bytes} />
              )}
            </div>
          )}

          <section className="mt-5">
            <h4 className={sectionTitle}>{t("app.sharing.linksTitle")}</h4>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t("app.sharing.linksHelp")}</p>
            <AddRow
              input={
                <input
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  placeholder={t("app.sharing.labelPlaceholder")}
                  className={smallInput}
                />
              }
              canUpload={linkCanUpload}
              onCanUploadChange={setLinkCanUpload}
              onAdd={handleCreateLink}
              icon={<Plus size={12} />}
              label={t("app.sharing.createLink")}
            />

            <div className="mt-3 space-y-1.5">
              {links.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("app.sharing.noLinks")}</p>
              )}
              {links.map((l) => (
                <div key={l.id} className={clsx(rowClass, l.revoked && "opacity-50")}>
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
                      <DeleteButton onClick={() => handleRevokeLink(l.id)} />
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <div className="flex items-center justify-between gap-2">
              <h4 className={sectionTitle}>{t("app.sharing.membersTitle")}</h4>
              {stats?.member_limit != null && (
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {stats.member_count} / {stats.member_limit}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t("app.sharing.membersHelp")}</p>
            {stats?.member_limit != null && <ProgressBar ratio={stats.member_count / stats.member_limit} />}

            <AddRow
              input={
                <input
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
                  type="email"
                  placeholder={t("app.sharing.emailPlaceholder")}
                  className={smallInput}
                />
              }
              canUpload={memberCanUpload}
              onCanUploadChange={setMemberCanUpload}
              onAdd={handleAddMember}
              icon={<UserPlus size={12} />}
              label={t("app.sharing.addMember")}
            />
            {memberError && <p className="mt-1.5 text-xs text-red-500">{memberError}</p>}

            <div className="mt-3 space-y-1.5">
              {members.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("app.sharing.noMembers")}</p>
              )}
              {members.map((m) => (
                <div key={m.id} className={rowClass}>
                  <UploadBadge canUpload={m.can_upload} />
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-300">
                    {m.display_name || m.email}
                  </span>
                  <DeleteButton onClick={() => handleRemoveMember(m.id)} />
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </Modal>
  );
}
