import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Check,
  Circle,
  Eye,
  Files,
  Folders,
  HardDrive,
  Link2,
  MessagesSquare,
  Plus,
  Star,
  Users2,
  X,
} from "lucide-react";
import { api } from "../../api/client";
import { listSharedLinks } from "../../api/storage";
import { useAuth } from "../../hooks/useAuth";
import { usePageMeta } from "../../hooks/usePageMeta";
import { formatBytes } from "../../utils/format";
import DashboardNav from "../../components/layout/DashboardNav";
import StatCard from "../../components/ui/StatCard";
import { Badge } from "../../components/ui/controls";
import SpaceModal, { type SpaceFormData } from "../../components/workspace/SpaceModal";
import type { MeStats, Space } from "../../types";
import { pageTitle } from "../../brand";

const CHECKLIST_DISMISSED_KEY = "hyaides:activation-dismissed";

/** Onboarding checklist (create a space, add a document, ask a question),
 * hidden once complete or dismissed. */
function ActivationChecklist({ stats, onCreateSpace }: { stats: MeStats; onCreateSpace: () => void }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(CHECKLIST_DISMISSED_KEY) === "1");

  const steps = [
    { done: stats.owned_spaces > 0, label: t("activation.step1"), onClick: onCreateSpace },
    { done: stats.document_count > 0, label: t("activation.step2") },
    { done: stats.message_count > 0, label: t("activation.step3") },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  if (dismissed || doneCount === steps.length) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(CHECKLIST_DISMISSED_KEY, "1");
    } catch {
      /* localStorage unavailable - just hide for this session */
    }
    setDismissed(true);
  };

  return (
    <div className="relative mt-6 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <button
        onClick={dismiss}
        aria-label={t("common.close")}
        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
      >
        <X size={15} />
      </button>
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("activation.title")}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {t("activation.progress", { done: doneCount, total: steps.length })}
      </p>
      <ul className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2 text-sm">
            {step.done ? (
              <Check size={16} className="shrink-0 text-emerald-500" />
            ) : (
              <Circle size={16} className="shrink-0 text-slate-300 dark:text-slate-600" />
            )}
            {!step.done && step.onClick ? (
              <button onClick={step.onClick} className="text-left text-accent underline-offset-2 hover:underline">
                {step.label}
              </button>
            ) : (
              <span
                className={
                  step.done ? "text-slate-500 line-through dark:text-slate-400" : "text-slate-700 dark:text-slate-300"
                }
              >
                {step.label}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Clickable card of a space (owned, joined, or opened via a share link). */
function SpaceCard({
  name,
  color,
  badge,
  onClick,
  children,
}: {
  name: string;
  color: string;
  badge: ReactNode;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-1 p-4 text-left transition hover:border-accent"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {name.slice(0, 2).toUpperCase()}
        </div>
        {badge}
      </div>
      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</p>
      {children}
    </button>
  );
}

const sectionTitle = "text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";
const cardGrid = "mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";

/** Signed-in home: usage KPIs, onboarding checklist and the user's spaces. */
export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  usePageMeta({ title: pageTitle(t("dashboard.title")), noindex: true });

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [stats, setStats] = useState<MeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    Promise.all([api.listSpaces(), api.meStats()])
      .then(([s, st]) => {
        setSpaces(s);
        setStats(st);
      })
      .finally(() => setLoading(false));
  }, []);

  // Spaces opened through a share link, minus any the user has since been
  // made a member of (those already appear in the main list).
  const sharedLinks = user ? listSharedLinks(user.id).filter((l) => !spaces.some((s) => s.id === l.spaceId)) : [];

  const handleCreate = async (data: SpaceFormData) => {
    const space = await api.createSpace(data.name, data.description, data.color);
    setModalOpen(false);
    navigate(`/app/${space.id}`);
  };

  return (
    <div className="min-h-[100dvh] bg-surface-0">
      <DashboardNav active="client" />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {t("dashboard.greeting", { name: user?.display_name || user?.email })}
        </h1>

        {stats && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              icon={<Folders size={14} />}
              label={t("dashboard.kpi.owned")}
              value={stats.owned_spaces}
              used={stats.owned_spaces}
              limit={stats.space_limit}
            />
            <StatCard icon={<Users2 size={14} />} label={t("dashboard.kpi.shared")} value={stats.member_spaces} />
            <StatCard icon={<Files size={14} />} label={t("dashboard.kpi.documents")} value={stats.document_count} />
            <StatCard
              icon={<MessagesSquare size={14} />}
              label={t("dashboard.kpi.conversations")}
              value={stats.conversation_count}
            />
            <StatCard
              icon={<MessagesSquare size={14} />}
              label={t("dashboard.kpi.messages")}
              value={stats.message_count}
            />
            <StatCard
              icon={<HardDrive size={14} />}
              label={t("dashboard.kpi.storage")}
              value={formatBytes(stats.storage_bytes)}
            />
          </div>
        )}

        {stats && <ActivationChecklist stats={stats} onCreateSpace={() => setModalOpen(true)} />}

        <div className="mt-8 flex items-center justify-between">
          <h2 className={sectionTitle}>{t("dashboard.mySpaces")}</h2>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover"
          >
            <Plus size={13} /> {t("dashboard.newSpace")}
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
        ) : spaces.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("dashboard.noSpaces")}</p>
        ) : (
          <div className={cardGrid}>
            {spaces.map((s) => (
              <SpaceCard
                key={s.id}
                name={s.name}
                color={s.color}
                onClick={() => navigate(`/app/${s.id}`)}
                badge={
                  <Badge
                    tone={s.my_role === "owner" ? "accent" : "muted"}
                    icon={s.my_role === "owner" ? <Star size={10} /> : <Eye size={10} />}
                  >
                    {t(`app.sharing.${s.my_role}`)}
                  </Badge>
                }
              >
                {s.description && (
                  <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{s.description}</p>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t("dashboard.spaceCounts", {
                    docs: t("dashboard.spaceDocs", { count: s.document_count }),
                    convs: t("dashboard.spaceConvs", { count: s.conversation_count }),
                  })}
                </p>
              </SpaceCard>
            ))}
          </div>
        )}

        {!loading && sharedLinks.length > 0 && (
          <>
            <h2 className={`mt-8 ${sectionTitle}`}>{t("dashboard.viaLink.title")}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("dashboard.viaLink.hint")}</p>
            <div className={cardGrid}>
              {sharedLinks.map((l) => (
                <SpaceCard
                  key={l.token}
                  name={l.name}
                  color={l.color}
                  onClick={() => navigate(`/share/${l.token}`)}
                  badge={<Badge icon={<Link2 size={10} />}>{t("dashboard.viaLink.badge")}</Badge>}
                />
              ))}
            </div>
          </>
        )}
      </main>

      <SpaceModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleCreate} />
    </div>
  );
}
