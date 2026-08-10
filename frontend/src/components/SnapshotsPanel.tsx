import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { History, RotateCcw, X } from "lucide-react";
import { api } from "../api/client";
import { formatBytes } from "../utils/format";
import ConfirmDialog from "./ConfirmDialog";
import type { Space, SpaceSnapshot } from "../types";

function relativeDateTime(iso: string): string {
  return new Date(iso + "Z").toLocaleString();
}

export default function SnapshotsPanel({
  open,
  space,
  onClose,
}: {
  open: boolean;
  space: Space | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [snapshots, setSnapshots] = useState<SpaceSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open || !space) return;
    setLoading(true);
    api
      .adminListSnapshots(space.id)
      .then(setSnapshots)
      .finally(() => setLoading(false));
  }, [open, space]);

  if (!open || !space) return null;

  const handleCreate = async () => {
    setCreating(true);
    try {
      const snap = await api.adminCreateSnapshot(space.id);
      setSnapshots((prev) => [snap, ...prev]);
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await api.adminRestoreSnapshot(space.id, restoreTarget);
    } finally {
      setRestoring(false);
      setRestoreTarget(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-surface-border bg-surface-2 p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("admin.snapshots.title", { name: space.name })}
          </h3>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t("admin.snapshots.retention")}</p>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="mt-4 flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-accent-hover disabled:opacity-40"
        >
          <History size={12} /> {t("admin.snapshots.createNow")}
        </button>

        <div className="mt-4 space-y-1.5">
          {loading ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
          ) : snapshots.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("admin.snapshots.empty")}</p>
          ) : (
            snapshots.map((snap) => (
              <div
                key={snap.id}
                className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-1 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-800 dark:text-slate-200">{relativeDateTime(snap.created_at)}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {snap.conversation_count} conv. · {snap.document_count} doc. · {formatBytes(snap.size_bytes)}
                  </p>
                </div>
                <button
                  onClick={() => setRestoreTarget(snap.id)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-600 dark:text-slate-400 hover:bg-surface-3"
                >
                  <RotateCcw size={12} /> {t("admin.snapshots.restore")}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!restoreTarget}
        title={t("admin.snapshots.confirmRestoreTitle")}
        message={t("admin.snapshots.confirmRestoreMessage")}
        confirmLabel={restoring ? t("common.loading") : t("admin.snapshots.restore")}
        onConfirm={handleRestore}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}
