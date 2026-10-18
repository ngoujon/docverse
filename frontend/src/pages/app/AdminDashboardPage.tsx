import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Files, Folders, HardDrive, Mail, MessagesSquare, Plus, Send, TrendingUp, Users } from "lucide-react";
import clsx from "clsx";
import { api } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import { usePageMeta } from "../../hooks/usePageMeta";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { formatBytes } from "../../utils/format";
import DashboardNav from "../../components/layout/DashboardNav";
import StatCard from "../../components/ui/StatCard";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import DataTable, { LoadMoreButton } from "../../components/admin/DataTable";
import {
  hint,
  useSpaceColumns,
  useSubscriberColumns,
  useTestimonialColumns,
  useUserColumns,
} from "../../components/admin/AdminTables";
import SnapshotsPanel from "../../components/admin/SnapshotsPanel";
import TestimonialModal from "../../components/admin/TestimonialModal";
import CreateUserModal from "../../components/admin/CreateUserModal";
import NewsletterCampaignModal from "../../components/admin/NewsletterCampaignModal";
import type { AdminStats, NewsletterSubscriber, Space, Testimonial, TestimonialInput, User } from "../../types";
import { pageTitle } from "../../brand";

type Tab = "users" | "spaces" | "testimonials" | "newsletter";
const TABS: Tab[] = ["users", "spaces", "testimonials", "newsletter"];

/** Row awaiting delete confirmation, and the i18n keys of its dialog. */
type PendingDelete =
  | { kind: "user"; item: User }
  | { kind: "space"; item: Space }
  | { kind: "testimonial"; item: Testimonial }
  | { kind: "subscriber"; item: NewsletterSubscriber };

const DELETE_DIALOGS: Record<PendingDelete["kind"], { title: string; message: string }> = {
  user: { title: "admin.actions.confirmDeleteUserTitle", message: "admin.actions.confirmDeleteUserMessage" },
  space: { title: "admin.actions.confirmDeleteSpaceTitle", message: "admin.actions.confirmDeleteSpaceMessage" },
  testimonial: { title: "admin.testimonials.confirmDeleteTitle", message: "admin.testimonials.confirmDeleteMessage" },
  subscriber: { title: "admin.newsletter.confirmDeleteTitle", message: "admin.newsletter.confirmDeleteMessage" },
};

const primaryButton =
  "flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover";
/** Instance administration: KPIs, users, spaces, testimonials, newsletter. */
export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  usePageMeta({ title: pageTitle(t("dashboard.nav.admin")), noindex: true });

  const [stats, setStats] = useState<AdminStats | null>(null);
  const users = usePaginatedList(api.adminUsers);
  const spaces = usePaginatedList(api.adminSpaces);
  const subscribers = usePaginatedList(api.adminNewsletterSubscribers);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("users");

  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testimonialModal, setTestimonialModal] = useState<{ open: boolean; editing: Testimonial | null }>({
    open: false,
    editing: null,
  });
  const [snapshotsSpace, setSnapshotsSpace] = useState<Space | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignSending, setCampaignSending] = useState(false);
  const [campaignResult, setCampaignResult] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      api.adminStats().then(setStats),
      users.reload(),
      spaces.reload(),
      api.adminListTestimonials().then(setTestimonials),
      subscribers.reload(),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Runs a row action while showing that row as busy. */
  const withBusy = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  };

  const updateUser = (u: User, patch: { role?: "admin" | "user"; is_active?: boolean }) =>
    withBusy(u.id, async () => users.replace(await api.adminUpdateUser(u.id, patch)));

  const replaceTestimonial = (updated: Testimonial) =>
    setTestimonials((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));

  const togglePublished = (item: Testimonial) =>
    withBusy(item.id, async () =>
      replaceTestimonial(await api.adminUpdateTestimonial(item.id, { published: !item.published })),
    );

  const submitTestimonial = async (data: TestimonialInput) => {
    const editing = testimonialModal.editing;
    if (editing) replaceTestimonial(await api.adminUpdateTestimonial(editing.id, data));
    else {
      const created = await api.adminCreateTestimonial(data);
      setTestimonials((prev) => [...prev, created]);
    }
    setTestimonialModal({ open: false, editing: null });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { kind, item } = pendingDelete;
    try {
      await withBusy(item.id, async () => {
        if (kind === "user") {
          await api.adminDeleteUser(item.id);
          users.remove(item.id);
        } else if (kind === "space") {
          await api.adminDeleteSpace(item.id);
          spaces.remove(item.id);
        } else if (kind === "testimonial") {
          await api.adminDeleteTestimonial(item.id);
          setTestimonials((prev) => prev.filter((x) => x.id !== item.id));
        } else {
          await api.adminDeleteNewsletterSubscriber(item.id);
          subscribers.remove(item.id);
        }
      });
    } finally {
      setPendingDelete(null);
    }
  };

  const sendCampaign = async (data: { subject: string; message: string }) => {
    setCampaignSending(true);
    try {
      const result = await api.adminSendNewsletterCampaign(data);
      setCampaignResult(result.sent);
      setCampaignOpen(false);
    } finally {
      setCampaignSending(false);
    }
  };

  const userColumns = useUserColumns({
    busyId,
    currentUserId: currentUser?.id,
    onUpdate: updateUser,
    onDelete: (item) => setPendingDelete({ kind: "user", item }),
  });
  const spaceColumns = useSpaceColumns({
    busyId,
    onSnapshots: setSnapshotsSpace,
    onDelete: (item) => setPendingDelete({ kind: "space", item }),
  });
  const testimonialColumns = useTestimonialColumns({
    busyId,
    onTogglePublished: togglePublished,
    onEdit: (item) => setTestimonialModal({ open: true, editing: item }),
    onDelete: (item) => setPendingDelete({ kind: "testimonial", item }),
  });
  const subscriberColumns = useSubscriberColumns({
    busyId,
    onDelete: (item) => setPendingDelete({ kind: "subscriber", item }),
  });

  // --- Render ----------------------------------------------------------------------------

  const renderTab = () => {
    switch (tab) {
      case "users":
        return (
          <>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setCreateUserOpen(true)} className={primaryButton}>
                <Plus size={13} /> {t("admin.users.createButton")}
              </button>
            </div>
            <DataTable columns={userColumns} rows={users.items} className="mt-3" />
            {users.hasMore && <LoadMoreButton onClick={users.loadMore} />}
          </>
        );
      case "spaces":
        return (
          <>
            <DataTable columns={spaceColumns} rows={spaces.items} />
            {spaces.hasMore && <LoadMoreButton onClick={spaces.loadMore} />}
          </>
        );
      case "testimonials":
        return (
          <>
            <div className="mt-4 flex items-center justify-between">
              <p className={hint}>{t("admin.testimonials.hint")}</p>
              <button onClick={() => setTestimonialModal({ open: true, editing: null })} className={primaryButton}>
                <Plus size={13} /> {t("admin.testimonials.create")}
              </button>
            </div>
            <DataTable
              columns={testimonialColumns}
              rows={testimonials}
              rowClassName="align-top"
              emptyText={t("admin.testimonials.empty")}
            />
          </>
        );
      case "newsletter":
        return (
          <>
            <div className="mt-4 flex items-center justify-between">
              <p className={hint}>{t("admin.newsletter.hint")}</p>
              <button
                onClick={() => {
                  setCampaignResult(null);
                  setCampaignOpen(true);
                }}
                className={primaryButton}
              >
                <Send size={13} /> {t("admin.newsletter.compose")}
              </button>
            </div>
            {campaignResult !== null && (
              <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
                {t("admin.newsletter.sent", { count: campaignResult })}
              </p>
            )}
            <DataTable columns={subscriberColumns} rows={subscribers.items} emptyText={t("admin.newsletter.empty")} />
            {subscribers.hasMore && <LoadMoreButton onClick={subscribers.loadMore} />}
          </>
        );
    }
  };

  return (
    <div className="min-h-[100dvh] bg-surface-0">
      <DashboardNav active="admin" />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t("admin.title")}</h1>

        {stats && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={<Users size={14} />} label={t("admin.kpi.users")} value={stats.users} />
            <StatCard icon={<Folders size={14} />} label={t("admin.kpi.spaces")} value={stats.spaces} />
            <StatCard icon={<Files size={14} />} label={t("admin.kpi.documents")} value={stats.documents} />
            <StatCard icon={<MessagesSquare size={14} />} label={t("admin.kpi.messages")} value={stats.messages} />
            <StatCard
              icon={<HardDrive size={14} />}
              label={t("admin.kpi.storage")}
              value={formatBytes(stats.storage_bytes)}
            />
            <StatCard
              icon={<Mail size={14} />}
              label={t("admin.kpi.newsletter")}
              value={stats.newsletter_subscribers}
            />
            <StatCard icon={<TrendingUp size={14} />} label={t("admin.kpi.newUsers7d")} value={stats.new_users_7d} />
            <StatCard icon={<TrendingUp size={14} />} label={t("admin.kpi.newSpaces7d")} value={stats.new_spaces_7d} />
          </div>
        )}

        <div className="mt-8 flex gap-1 rounded-lg border border-surface-border p-1 w-fit">
          {TABS.map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                "rounded-md px-3 py-1.5 text-xs font-medium",
                tab === key ? "bg-accent text-white" : "text-slate-600 dark:text-slate-400",
              )}
            >
              {t(`admin.tabs.${key}`)}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
        ) : (
          renderTab()
        )}
      </main>

      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete ? t(DELETE_DIALOGS[pendingDelete.kind].title) : ""}
        message={pendingDelete ? t(DELETE_DIALOGS[pendingDelete.kind].message) : ""}
        confirmLabel={t("admin.actions.delete")}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      <SnapshotsPanel open={!!snapshotsSpace} space={snapshotsSpace} onClose={() => setSnapshotsSpace(null)} />
      <NewsletterCampaignModal
        open={campaignOpen}
        recipientCount={stats?.newsletter_subscribers ?? 0}
        sending={campaignSending}
        onClose={() => setCampaignOpen(false)}
        onSubmit={sendCampaign}
      />
      <CreateUserModal
        open={createUserOpen}
        onClose={() => setCreateUserOpen(false)}
        onSubmit={async (data) => {
          users.prepend(await api.adminCreateUser(data));
          setCreateUserOpen(false);
        }}
      />
      <TestimonialModal
        // Remount per testimonial so the form starts from its values.
        key={testimonialModal.editing?.id ?? "new"}
        open={testimonialModal.open}
        initial={testimonialModal.editing}
        onClose={() => setTestimonialModal({ open: false, editing: null })}
        onSubmit={submitTestimonial}
      />
    </div>
  );
}
