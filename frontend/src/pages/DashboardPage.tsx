import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eye, Files, Folders, MessagesSquare, Pencil, Plus, Star, Users2, HardDrive } from "lucide-react";
import clsx from "clsx";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { usePageMeta } from "../hooks/usePageMeta";
import { formatBytes } from "../utils/format";
import DashboardNav from "../components/DashboardNav";
import StatCard from "../components/StatCard";
import SpaceModal, { type SpaceFormData } from "../components/SpaceModal";
import type { MeStats, Space } from "../types";

function RoleBadge({ role }: { role: Space["my_role"] }) {
  const { t } = useTranslation();
  const icon = role === "owner" ? <Star size={10} /> : role === "editor" ? <Pencil size={10} /> : <Eye size={10} />;
  return (
    <span
      className={clsx(
        "flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        role === "owner"
          ? "bg-accent/15 text-accent"
          : role === "editor"
          ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
          : "bg-surface-3 text-slate-600 dark:text-slate-300"
      )}
    >
      {icon}
      {t(`app.sharing.${role}`)}
    </span>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  usePageMeta({ title: `${t("dashboard.title")} - Open RAG`, noindex: true });

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
            <StatCard icon={<MessagesSquare size={14} />} label={t("dashboard.kpi.messages")} value={stats.message_count} />
            <StatCard icon={<HardDrive size={14} />} label={t("dashboard.kpi.storage")} value={formatBytes(stats.storage_bytes)} />
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("dashboard.mySpaces")}
          </h2>
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
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/app/${s.id}`)}
                className="flex flex-col items-start gap-2 rounded-xl border border-surface-border bg-surface-1 p-4 text-left transition hover:border-accent"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: s.color }}
                  >
                    {s.name.slice(0, 2).toUpperCase()}
                  </div>
                  <RoleBadge role={s.my_role} />
                </div>
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{s.name}</p>
                {s.description && (
                  <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{s.description}</p>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t("dashboard.spaceCounts", {
                    docs: s.document_count,
                    convs: s.conversation_count,
                  })}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>

      <SpaceModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleCreate} />
    </div>
  );
}
