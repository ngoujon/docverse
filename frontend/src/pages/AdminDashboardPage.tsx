import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowDownToLine,
  Ban,
  CheckCircle2,
  Eye,
  EyeOff,
  Files,
  Folders,
  HardDrive,
  History,
  Mail,
  MessagesSquare,
  Pencil,
  Plus,
  ShieldMinus,
  ShieldPlus,
  Star,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { api } from "../api/client";
import { usePageMeta } from "../hooks/usePageMeta";
import { useAuth } from "../hooks/useAuth";
import { formatBytes } from "../utils/format";
import DashboardNav from "../components/DashboardNav";
import StatCard from "../components/StatCard";
import ConfirmDialog from "../components/ConfirmDialog";
import SnapshotsPanel from "../components/SnapshotsPanel";
import TestimonialModal from "../components/TestimonialModal";
import type { AdminStats, Space, Testimonial, TestimonialInput, User } from "../types";

const PAGE_SIZE = 50;

function relativeDate(iso: string): string {
  return new Date(iso + "Z").toLocaleDateString();
}

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  usePageMeta({ title: `${t("dashboard.nav.admin")} - Open RAG`, noindex: true });

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spacesTotal, setSpacesTotal] = useState(0);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"users" | "spaces" | "testimonials">("users");

  const [deleteUserTarget, setDeleteUserTarget] = useState<User | null>(null);
  const [deleteSpaceTarget, setDeleteSpaceTarget] = useState<Space | null>(null);
  const [deleteTestimonialTarget, setDeleteTestimonialTarget] = useState<Testimonial | null>(null);
  const [testimonialModalOpen, setTestimonialModalOpen] = useState(false);
  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null);
  const [snapshotsSpace, setSnapshotsSpace] = useState<Space | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadInitial = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.adminStats(),
      api.adminUsers(PAGE_SIZE, 0),
      api.adminSpaces(PAGE_SIZE, 0),
      api.adminListTestimonials(),
    ])
      .then(([st, u, s, tst]) => {
        setStats(st);
        setUsers(u.items);
        setUsersTotal(u.total);
        setSpaces(s.items);
        setSpacesTotal(s.total);
        setTestimonials(tst);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loadMoreUsers = async () => {
    const page = await api.adminUsers(PAGE_SIZE, users.length);
    setUsers((prev) => [...prev, ...page.items]);
    setUsersTotal(page.total);
  };

  const loadMoreSpaces = async () => {
    const page = await api.adminSpaces(PAGE_SIZE, spaces.length);
    setSpaces((prev) => [...prev, ...page.items]);
    setSpacesTotal(page.total);
  };

  const toggleRole = async (u: User) => {
    setBusyId(u.id);
    try {
      const updated = await api.adminUpdateUser(u.id, { role: u.role === "admin" ? "user" : "admin" });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (u: User) => {
    setBusyId(u.id);
    try {
      const updated = await api.adminUpdateUser(u.id, { is_active: !u.is_active });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteUserTarget) return;
    const id = deleteUserTarget.id;
    setBusyId(id);
    try {
      await api.adminDeleteUser(id);
      setUsers((prev) => prev.filter((x) => x.id !== id));
      setUsersTotal((n) => n - 1);
    } finally {
      setBusyId(null);
      setDeleteUserTarget(null);
    }
  };

  const togglePublished = async (item: Testimonial) => {
    setBusyId(item.id);
    try {
      const updated = await api.adminUpdateTestimonial(item.id, { published: !item.published });
      setTestimonials((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
    } finally {
      setBusyId(null);
    }
  };

  const submitTestimonial = async (data: TestimonialInput) => {
    if (editingTestimonial) {
      const updated = await api.adminUpdateTestimonial(editingTestimonial.id, data);
      setTestimonials((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } else {
      const created = await api.adminCreateTestimonial(data);
      setTestimonials((prev) => [...prev, created]);
    }
    setTestimonialModalOpen(false);
    setEditingTestimonial(null);
  };

  const confirmDeleteTestimonial = async () => {
    if (!deleteTestimonialTarget) return;
    const id = deleteTestimonialTarget.id;
    setBusyId(id);
    try {
      await api.adminDeleteTestimonial(id);
      setTestimonials((prev) => prev.filter((x) => x.id !== id));
    } finally {
      setBusyId(null);
      setDeleteTestimonialTarget(null);
    }
  };

  const confirmDeleteSpace = async () => {
    if (!deleteSpaceTarget) return;
    const id = deleteSpaceTarget.id;
    setBusyId(id);
    try {
      await api.adminDeleteSpace(id);
      setSpaces((prev) => prev.filter((x) => x.id !== id));
      setSpacesTotal((n) => n - 1);
    } finally {
      setBusyId(null);
      setDeleteSpaceTarget(null);
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
            <StatCard icon={<HardDrive size={14} />} label={t("admin.kpi.storage")} value={formatBytes(stats.storage_bytes)} />
            <StatCard icon={<Mail size={14} />} label={t("admin.kpi.newsletter")} value={stats.newsletter_subscribers} />
            <StatCard icon={<TrendingUp size={14} />} label={t("admin.kpi.newUsers7d")} value={stats.new_users_7d} />
            <StatCard icon={<TrendingUp size={14} />} label={t("admin.kpi.newSpaces7d")} value={stats.new_spaces_7d} />
          </div>
        )}

        <div className="mt-8 flex gap-1 rounded-lg border border-surface-border p-1 w-fit">
          <button
            onClick={() => setTab("users")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === "users" ? "bg-accent text-white" : "text-slate-600 dark:text-slate-400"
            }`}
          >
            {t("admin.tabs.users")}
          </button>
          <button
            onClick={() => setTab("spaces")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === "spaces" ? "bg-accent text-white" : "text-slate-600 dark:text-slate-400"
            }`}
          >
            {t("admin.tabs.spaces")}
          </button>
          <button
            onClick={() => setTab("testimonials")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === "testimonials" ? "bg-accent text-white" : "text-slate-600 dark:text-slate-400"
            }`}
          >
            {t("admin.tabs.testimonials")}
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
        ) : tab === "users" ? (
          <>
            <div className="mt-4 overflow-x-auto rounded-xl border border-surface-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">{t("admin.table.email")}</th>
                    <th className="px-4 py-2.5">{t("admin.table.displayName")}</th>
                    <th className="px-4 py-2.5">{t("admin.table.role")}</th>
                    <th className="px-4 py-2.5">{t("admin.table.status")}</th>
                    <th className="px-4 py-2.5">{t("admin.table.createdAt")}</th>
                    <th className="px-4 py-2.5 text-right">{t("admin.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    const busy = busyId === u.id;
                    return (
                      <tr key={u.id} className="border-t border-surface-border">
                        <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">{u.email}</td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{u.display_name || "-"}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                              u.role === "admin" ? "bg-accent/15 text-accent" : "bg-surface-3 text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                              u.is_active
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : "bg-red-500/15 text-red-600 dark:text-red-400"
                            }`}
                          >
                            {u.is_active ? t("admin.status.active") : t("admin.status.disabled")}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{relativeDate(u.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              title={u.role === "admin" ? t("admin.actions.demote") : t("admin.actions.promote")}
                              disabled={busy || isSelf}
                              onClick={() => toggleRole(u)}
                              className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-surface-3 disabled:opacity-30"
                            >
                              {u.role === "admin" ? <ShieldMinus size={14} /> : <ShieldPlus size={14} />}
                            </button>
                            <button
                              title={u.is_active ? t("admin.actions.disable") : t("admin.actions.enable")}
                              disabled={busy || isSelf}
                              onClick={() => toggleActive(u)}
                              className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-surface-3 disabled:opacity-30"
                            >
                              {u.is_active ? <Ban size={14} /> : <CheckCircle2 size={14} />}
                            </button>
                            <button
                              title={t("admin.actions.delete")}
                              disabled={busy || isSelf}
                              onClick={() => setDeleteUserTarget(u)}
                              className="rounded-md p-1.5 text-red-500 hover:bg-red-500/10 disabled:opacity-30"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {users.length < usersTotal && (
              <button
                onClick={loadMoreUsers}
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-surface-3"
              >
                <ArrowDownToLine size={12} /> {t("admin.actions.loadMore")}
              </button>
            )}
          </>
        ) : tab === "spaces" ? (
          <>
            <div className="mt-4 overflow-x-auto rounded-xl border border-surface-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">{t("admin.table.name")}</th>
                    <th className="px-4 py-2.5">{t("admin.table.documents")}</th>
                    <th className="px-4 py-2.5">{t("admin.table.conversations")}</th>
                    <th className="px-4 py-2.5">{t("admin.table.createdAt")}</th>
                    <th className="px-4 py-2.5 text-right">{t("admin.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {spaces.map((s) => {
                    const busy = busyId === s.id;
                    return (
                      <tr key={s.id} className="border-t border-surface-border">
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                            {s.name}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{s.document_count}</td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{s.conversation_count}</td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{relativeDate(s.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              title={t("admin.actions.view")}
                              onClick={() => navigate(`/app/${s.id}`)}
                              className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-surface-3"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              title={t("admin.actions.snapshots")}
                              onClick={() => setSnapshotsSpace(s)}
                              className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-surface-3"
                            >
                              <History size={14} />
                            </button>
                            <button
                              title={t("admin.actions.delete")}
                              disabled={busy}
                              onClick={() => setDeleteSpaceTarget(s)}
                              className="rounded-md p-1.5 text-red-500 hover:bg-red-500/10 disabled:opacity-30"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {spaces.length < spacesTotal && (
              <button
                onClick={loadMoreSpaces}
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-surface-3"
              >
                <ArrowDownToLine size={12} /> {t("admin.actions.loadMore")}
              </button>
            )}
          </>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("admin.testimonials.hint")}</p>
              <button
                onClick={() => {
                  setEditingTestimonial(null);
                  setTestimonialModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover"
              >
                <Plus size={13} /> {t("admin.testimonials.create")}
              </button>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-surface-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">{t("admin.testimonials.authorName")}</th>
                    <th className="px-4 py-2.5">{t("admin.testimonials.content")}</th>
                    <th className="px-4 py-2.5">{t("admin.testimonials.rating")}</th>
                    <th className="px-4 py-2.5">{t("admin.table.status")}</th>
                    <th className="px-4 py-2.5 text-right">{t("admin.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {testimonials.map((item) => {
                    const busy = busyId === item.id;
                    return (
                      <tr key={item.id} className="border-t border-surface-border align-top">
                        <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">
                          <p className="font-medium">{item.author_name}</p>
                          {(item.author_role || item.author_company) && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {[item.author_role, item.author_company].filter(Boolean).join(" - ")}
                            </p>
                          )}
                        </td>
                        <td className="max-w-sm px-4 py-2.5 text-slate-600 dark:text-slate-400">
                          <p className="line-clamp-2">{item.content}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-0.5 text-amber-400">
                            {Array.from({ length: item.rating }).map((_, i) => (
                              <Star key={i} size={12} className="fill-amber-400" />
                            ))}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                              item.published
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : "bg-surface-3 text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {item.published ? t("admin.testimonials.published") : t("admin.testimonials.draft")}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              title={item.published ? t("admin.testimonials.unpublish") : t("admin.testimonials.publish")}
                              disabled={busy}
                              onClick={() => togglePublished(item)}
                              className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-surface-3 disabled:opacity-30"
                            >
                              {item.published ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                            <button
                              title={t("common.save")}
                              disabled={busy}
                              onClick={() => {
                                setEditingTestimonial(item);
                                setTestimonialModalOpen(true);
                              }}
                              className="rounded-md p-1.5 text-slate-500 dark:text-slate-400 hover:bg-surface-3 disabled:opacity-30"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              title={t("admin.actions.delete")}
                              disabled={busy}
                              onClick={() => setDeleteTestimonialTarget(item)}
                              className="rounded-md p-1.5 text-red-500 hover:bg-red-500/10 disabled:opacity-30"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {testimonials.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                        {t("admin.testimonials.empty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      <ConfirmDialog
        open={!!deleteUserTarget}
        title={t("admin.actions.confirmDeleteUserTitle")}
        message={t("admin.actions.confirmDeleteUserMessage")}
        confirmLabel={t("admin.actions.delete")}
        onConfirm={confirmDeleteUser}
        onCancel={() => setDeleteUserTarget(null)}
      />
      <ConfirmDialog
        open={!!deleteSpaceTarget}
        title={t("admin.actions.confirmDeleteSpaceTitle")}
        message={t("admin.actions.confirmDeleteSpaceMessage")}
        confirmLabel={t("admin.actions.delete")}
        onConfirm={confirmDeleteSpace}
        onCancel={() => setDeleteSpaceTarget(null)}
      />
      <SnapshotsPanel
        open={!!snapshotsSpace}
        space={snapshotsSpace}
        onClose={() => setSnapshotsSpace(null)}
      />
      <ConfirmDialog
        open={!!deleteTestimonialTarget}
        title={t("admin.testimonials.confirmDeleteTitle")}
        message={t("admin.testimonials.confirmDeleteMessage")}
        confirmLabel={t("admin.actions.delete")}
        onConfirm={confirmDeleteTestimonial}
        onCancel={() => setDeleteTestimonialTarget(null)}
      />
      <TestimonialModal
        open={testimonialModalOpen}
        initial={editingTestimonial}
        onClose={() => {
          setTestimonialModalOpen(false);
          setEditingTestimonial(null);
        }}
        onSubmit={submitTestimonial}
      />
    </div>
  );
}
