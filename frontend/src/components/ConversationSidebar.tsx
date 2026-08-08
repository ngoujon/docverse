import { useState } from "react";
import { Plus, MessageSquare, Pencil, Trash2, Settings } from "lucide-react";
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
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso + "Z").getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "a l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
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
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-surface-border bg-surface-1">
      <div className="border-b border-surface-border p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-100">{space.name}</h2>
            {space.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{space.description}</p>
            )}
          </div>
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-surface-3 hover:text-slate-300"
            >
              <Settings size={15} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-surface-border bg-surface-2 shadow-panel">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onEditSpace();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-surface-3"
                  >
                    <Pencil size={13} /> Modifier l'espace
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDeleteSpace();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-400 hover:bg-surface-3"
                  >
                    <Trash2 size={13} /> Supprimer l'espace
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <button
          onClick={onCreate}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover"
        >
          <Plus size={14} /> Nouvelle conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 && (
          <p className="mt-6 px-3 text-center text-xs text-slate-600">
            Aucune conversation pour l'instant.
          </p>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={clsx(
              "group mb-1 flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors",
              activeConversationId === c.id ? "bg-surface-3" : "hover:bg-surface-2"
            )}
          >
            <MessageSquare size={14} className="mt-0.5 shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-200">{c.title}</p>
              <p className="text-[11px] text-slate-500">{relativeTime(c.updated_at)}</p>
            </div>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
              className="mt-0.5 shrink-0 rounded p-0.5 text-slate-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
