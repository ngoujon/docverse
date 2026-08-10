import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Plus,
  MessageSquare,
  Pencil,
  Trash2,
  Settings,
  Eye,
  Share2,
} from "lucide-react";
import clsx from "clsx";
import type { Conversation, Space } from "../types";

interface Props {
  space: Space;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onEditSpace: () => void;
  onDeleteSpace: () => void;
  onOpenSharing: () => void;
}

function relativeTime(iso: string, t: TFunction): string {
  const diffMs = Date.now() - new Date(iso + "Z").getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t("app.sidebar.justNow");
  if (mins < 60) return t("app.sidebar.minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("app.sidebar.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("app.sidebar.daysAgo", { count: days });
}

export default function ConversationSidebar({
  space,
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
  onEditSpace,
  onDeleteSpace,
  onOpenSharing,
}: Props) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwner = space.my_role === "owner";
  const canWrite = space.my_role === "owner" || space.my_role === "editor";

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-surface-border bg-surface-1">
      <div className="border-b border-surface-border p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {!canWrite && (
                <Eye
                  size={12}
                  className="shrink-0 text-slate-500 dark:text-slate-400"
                  aria-label={t("app.sidebar.readOnly")}
                />
              )}
              <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{space.name}</h2>
            </div>
            {space.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{space.description}</p>
            )}
          </div>
          {isOwner && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={onOpenSharing}
                title={t("app.sidebar.shareTitle")}
                className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-surface-3 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <Share2 size={15} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  title={t("app.sidebar.spaceOptions")}
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-surface-3 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <Settings size={15} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-surface-border bg-surface-2 shadow-panel">
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onEditSpace();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-surface-3"
                      >
                        <Pencil size={13} /> {t("app.sidebar.editSpace")}
                      </button>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onDeleteSpace();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-surface-3"
                      >
                        <Trash2 size={13} /> {t("app.sidebar.deleteSpace")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {canWrite && (
          <button
            onClick={onCreate}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-white shadow-neon-light hover:bg-accent-hover"
          >
            <Plus size={14} /> {t("app.sidebar.newConversation")}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 && (
          <p className="mt-6 px-3 text-center text-xs text-slate-600 dark:text-slate-400">
            {t("app.sidebar.noConversations")}
          </p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(c.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(c.id);
              }
            }}
            className={clsx(
              "group mb-1 flex w-full cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors",
              activeConversationId === c.id ? "bg-surface-3" : "hover:bg-surface-2"
            )}
          >
            <MessageSquare size={14} className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">{c.title}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{relativeTime(c.updated_at, t)}</p>
            </div>
            {canWrite && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                }}
                aria-label={t("common.delete")}
                className="mt-0.5 shrink-0 rounded p-0.5 text-slate-500 dark:text-slate-400 opacity-0 hover:text-red-500 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
