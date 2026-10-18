import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Ban, CheckCircle2, Eye, EyeOff, History, Pencil, ShieldMinus, ShieldPlus, Star, Trash2 } from "lucide-react";
import { Badge, IconButton } from "../ui/controls";
import { RowActions, type Column } from "./DataTable";
import type { NewsletterSubscriber, Space, Testimonial, User } from "../../types";

/** Column definitions of the four admin dashboard tables. Each hook takes
 * the row currently being processed (`busyId`) and the row action handlers. */

const strongCell = "text-slate-800 dark:text-slate-200";
const mutedCell = "text-slate-600 dark:text-slate-400";
export const hint = "text-xs text-slate-500 dark:text-slate-400";

/** Backend dates are naive UTC. */
function formatDate(iso: string): string {
  return new Date(iso + "Z").toLocaleDateString();
}

function DeleteButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <IconButton title={t("admin.actions.delete")} onClick={onClick} disabled={disabled} danger>
      <Trash2 size={14} />
    </IconButton>
  );
}

interface RowHandlers<T> {
  busyId: string | null;
  onDelete: (item: T) => void;
}

export function useUserColumns({
  busyId,
  currentUserId,
  onUpdate,
  onDelete,
}: RowHandlers<User> & {
  currentUserId?: string;
  onUpdate: (user: User, patch: { role?: "admin" | "user"; is_active?: boolean }) => void;
}): Column<User>[] {
  const { t } = useTranslation();
  const columns: Column<User>[] = [
    { header: t("admin.table.email"), cell: (u) => u.email, className: strongCell },
    { header: t("admin.table.displayName"), cell: (u) => u.display_name || "-", className: mutedCell },
    {
      header: t("admin.table.role"),
      cell: (u) => <Badge tone={u.role === "admin" ? "accent" : "muted"}>{u.role}</Badge>,
    },
    {
      header: t("admin.table.status"),
      cell: (u) => (
        <Badge tone={u.is_active ? "success" : "danger"}>
          {u.is_active ? t("admin.status.active") : t("admin.status.disabled")}
        </Badge>
      ),
    },
    { header: t("admin.table.createdAt"), cell: (u) => formatDate(u.created_at), className: mutedCell },
    {
      header: t("admin.table.actions"),
      cell: (u) => {
        // An admin can't demote, disable or delete their own account here.
        const locked = busyId === u.id || u.id === currentUserId;
        return (
          <RowActions>
            <IconButton
              title={u.role === "admin" ? t("admin.actions.demote") : t("admin.actions.promote")}
              disabled={locked}
              onClick={() => onUpdate(u, { role: u.role === "admin" ? "user" : "admin" })}
            >
              {u.role === "admin" ? <ShieldMinus size={14} /> : <ShieldPlus size={14} />}
            </IconButton>
            <IconButton
              title={u.is_active ? t("admin.actions.disable") : t("admin.actions.enable")}
              disabled={locked}
              onClick={() => onUpdate(u, { is_active: !u.is_active })}
            >
              {u.is_active ? <Ban size={14} /> : <CheckCircle2 size={14} />}
            </IconButton>
            <DeleteButton onClick={() => onDelete(u)} disabled={locked} />
          </RowActions>
        );
      },
    },
  ];
  return columns;
}

export function useSpaceColumns({
  busyId,
  onSnapshots,
  onDelete,
}: RowHandlers<Space> & { onSnapshots: (space: Space) => void }): Column<Space>[] {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const columns: Column<Space>[] = [
    {
      header: t("admin.table.name"),
      cell: (s) => (
        <span className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
          {s.name}
        </span>
      ),
    },
    { header: t("admin.table.documents"), cell: (s) => s.document_count, className: mutedCell },
    { header: t("admin.table.conversations"), cell: (s) => s.conversation_count, className: mutedCell },
    { header: t("admin.table.createdAt"), cell: (s) => formatDate(s.created_at), className: mutedCell },
    {
      header: t("admin.table.actions"),
      cell: (s) => (
        <RowActions>
          <IconButton title={t("admin.actions.view")} onClick={() => navigate(`/app/${s.id}`)}>
            <Eye size={14} />
          </IconButton>
          <IconButton title={t("admin.actions.snapshots")} onClick={() => onSnapshots(s)}>
            <History size={14} />
          </IconButton>
          <DeleteButton onClick={() => onDelete(s)} disabled={busyId === s.id} />
        </RowActions>
      ),
    },
  ];
  return columns;
}

export function useTestimonialColumns({
  busyId,
  onTogglePublished,
  onEdit,
  onDelete,
}: RowHandlers<Testimonial> & {
  onTogglePublished: (item: Testimonial) => void;
  onEdit: (item: Testimonial) => void;
}): Column<Testimonial>[] {
  const { t } = useTranslation();
  const columns: Column<Testimonial>[] = [
    {
      header: t("admin.testimonials.authorName"),
      className: strongCell,
      cell: (item) => (
        <>
          <p className="font-medium">{item.author_name}</p>
          {(item.author_role || item.author_company) && (
            <p className={hint}>{[item.author_role, item.author_company].filter(Boolean).join(" - ")}</p>
          )}
        </>
      ),
    },
    {
      header: t("admin.testimonials.content"),
      className: `max-w-sm ${mutedCell}`,
      cell: (item) => <p className="line-clamp-2">{item.content}</p>,
    },
    {
      header: t("admin.testimonials.rating"),
      cell: (item) => (
        <span className="flex items-center gap-0.5 text-amber-400">
          {Array.from({ length: item.rating }).map((_, i) => (
            <Star key={i} size={12} className="fill-amber-400" />
          ))}
        </span>
      ),
    },
    {
      header: t("admin.table.status"),
      cell: (item) => (
        <Badge tone={item.published ? "success" : "muted"}>
          {item.published ? t("admin.testimonials.published") : t("admin.testimonials.draft")}
        </Badge>
      ),
    },
    {
      header: t("admin.table.actions"),
      cell: (item) => {
        const busy = busyId === item.id;
        return (
          <RowActions>
            <IconButton
              title={item.published ? t("admin.testimonials.unpublish") : t("admin.testimonials.publish")}
              disabled={busy}
              onClick={() => onTogglePublished(item)}
            >
              {item.published ? <EyeOff size={14} /> : <Eye size={14} />}
            </IconButton>
            <IconButton title={t("common.save")} disabled={busy} onClick={() => onEdit(item)}>
              <Pencil size={14} />
            </IconButton>
            <DeleteButton onClick={() => onDelete(item)} disabled={busy} />
          </RowActions>
        );
      },
    },
  ];
  return columns;
}

export function useSubscriberColumns({
  busyId,
  onDelete,
}: RowHandlers<NewsletterSubscriber>): Column<NewsletterSubscriber>[] {
  const { t } = useTranslation();
  const columns: Column<NewsletterSubscriber>[] = [
    { header: t("admin.table.email"), cell: (sub) => sub.email, className: strongCell },
    {
      header: t("admin.table.status"),
      cell: (sub) => (
        <Badge tone={sub.confirmed ? "success" : "muted"}>
          {sub.confirmed ? t("admin.newsletter.confirmed") : t("admin.newsletter.pending")}
        </Badge>
      ),
    },
    { header: t("admin.table.createdAt"), cell: (sub) => formatDate(sub.created_at), className: mutedCell },
    {
      header: t("admin.table.actions"),
      cell: (sub) => (
        <RowActions>
          <DeleteButton onClick={() => onDelete(sub)} disabled={busyId === sub.id} />
        </RowActions>
      ),
    },
  ];
  return columns;
}
