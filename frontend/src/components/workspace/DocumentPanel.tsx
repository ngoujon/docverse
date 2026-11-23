import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  FileType,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  Eye,
  Pencil,
  Check,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { errorMessage } from "../../api/client";
import { formatBytes } from "../../utils/format";
import type { DocumentItem, DocumentStage } from "../../types";

/** A file the server refused at upload (size, format, quota...). */
export interface UploadError {
  name: string;
  message: string;
}

interface Props {
  documents: DocumentItem[];
  onUpload: (files: File[]) => void;
  onIngestUrl: (url: string) => void;
  onDelete: (id: string) => void;
  onView: (doc: DocumentItem) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onRetry?: (id: string) => Promise<void>;
  uploadErrors?: UploadError[];
  onDismissUploadErrors?: () => void;
  canRename?: boolean;
  onClose?: () => void;
  readOnly?: boolean;
}

const STAGE_LABELS: Record<Exclude<DocumentStage, "queued">, string> = {
  reading: "app.documents.stageReading",
  embedding: "app.documents.stageEmbedding",
  saving: "app.documents.stageSaving",
};

/** Progress of a document waiting for, or going through, indexing.
 * Documents are indexed one at a time: a waiting one shows its place in
 * the queue, the one being indexed a filling bar. */
function IndexingProgress({ doc }: { doc: DocumentItem }) {
  const { t } = useTranslation();
  const waiting = doc.status === "pending";
  const percent = waiting ? 0 : Math.max(2, Math.min(100, doc.progress ?? 0));
  const stage = doc.stage && doc.stage !== "queued" ? doc.stage : "reading";
  const label = waiting
    ? doc.queue_position
      ? t("app.documents.queueAhead", { count: doc.queue_position })
      : t("app.documents.queueNext")
    : t(STAGE_LABELS[stage]);

  return (
    <div className="mt-1">
      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="flex min-w-0 items-center gap-1">
          {waiting ? (
            <Clock size={12} className="shrink-0" />
          ) : (
            <Loader2 size={12} className="shrink-0 animate-spin text-accent" />
          )}
          <span className="truncate">
            {waiting && <span>{t("app.documents.stageQueued")} · </span>}
            {label}
          </span>
        </span>
        {!waiting && <span className="shrink-0 tabular-nums">{percent} %</span>}
      </div>
      <div
        role="progressbar"
        aria-label={t("app.documents.progressLabel", { name: doc.name })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={clsx(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            waiting ? "bg-transparent" : "bg-accent",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** "Réessayer" on a document whose indexing failed. */
function RetryButton({ onRetry }: { onRetry: () => Promise<void> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-1">
      <button
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onRetry();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-surface-border bg-surface-1 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-200 hover:bg-surface-3 disabled:opacity-50"
      >
        {busy ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
        {t("app.documents.retry")}
      </button>
      {error && <p className="mt-0.5 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

const iconButton =
  "shrink-0 rounded p-1 text-slate-500 dark:text-slate-400 hover:bg-surface-3 hover:text-slate-800 dark:hover:text-slate-100";

/** Inline name editor: Enter saves, Escape cancels. */
function RenameField({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const name = value.trim();
    if (!name || name === initial) return onCancel();
    setSaving(true);
    setError(null);
    try {
      await onSave(name);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={value}
          maxLength={200}
          disabled={saving}
          aria-label={t("app.documents.renameLabel")}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              e.stopPropagation();
              onCancel();
            }
          }}
          className="min-w-0 flex-1 rounded border border-surface-border bg-surface-1 px-1.5 py-0.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-accent"
        />
        <button onClick={save} disabled={saving} aria-label={t("app.documents.renameSave")} className={iconButton}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          aria-label={t("app.documents.renameCancel")}
          className={iconButton}
        >
          <X size={13} />
        </button>
      </div>
      {error && <p className="mt-0.5 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

const ICONS: Record<DocumentItem["doc_type"], LucideIcon> = {
  pdf: FileText,
  image: ImageIcon,
  url: LinkIcon,
  docx: FileType,
  txt: FileText,
  md: FileText,
};

const STATUS_LABELS: Record<DocumentItem["status"], string> = {
  ready: "app.documents.statusReady",
  pending: "app.documents.statusPending",
  processing: "app.documents.statusProcessing",
  error: "app.documents.statusError",
};

function StatusIcon({ status }: { status: DocumentItem["status"] }) {
  if (status === "ready") return <CheckCircle2 size={14} className="text-emerald-500" />;
  if (status === "error") return <AlertCircle size={14} className="text-red-500" />;
  if (status === "processing") return <Loader2 size={14} className="animate-spin text-accent" />;
  return <Clock size={14} className="text-slate-500 dark:text-slate-400" />;
}

/** Same formats as the backend upload check (document_processor.py). */
const ACCEPTED_FILES = {
  "application/pdf": [".pdf"],
  "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "audio/*": [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm"],
};

/** Right-hand panel: drop zone / URL import and the space's documents with
 * their indexing status. */
export default function DocumentPanel({
  documents,
  onUpload,
  onIngestUrl,
  onDelete,
  onView,
  onRename,
  onRetry,
  uploadErrors = [],
  onDismissUploadErrors,
  canRename,
  onClose,
  readOnly,
}: Props) {
  const { t } = useTranslation();
  const [urlInput, setUrlInput] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const remaining = documents.filter((d) => d.status === "pending" || d.status === "processing").length;

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length) onUpload(accepted);
    },
    [onUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILES,
  });

  const handleUrlSubmit = () => {
    const url = urlInput.trim();
    if (!url) return;
    onIngestUrl(url);
    setUrlInput("");
  };

  return (
    <aside className="flex h-full w-[85vw] max-w-[320px] shrink-0 flex-col border-l border-surface-border bg-surface-1 sm:w-[320px]">
      <div className="flex items-start justify-between gap-2 border-b border-surface-border p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("app.documents.title")}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t("app.documents.subtitle")}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="shrink-0 rounded-lg p-1 text-slate-500 dark:text-slate-400 hover:bg-surface-3 hover:text-slate-700 dark:hover:text-slate-200 lg:hidden"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {!readOnly && (
        <div className="p-3">
          <div
            {...getRootProps()}
            className={clsx(
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-6 text-center transition-colors",
              isDragActive
                ? "border-accent bg-accent/10"
                : "border-surface-border hover:border-slate-400 dark:hover:border-slate-600 hover:bg-surface-2",
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud size={22} className={isDragActive ? "text-accent" : "text-slate-500 dark:text-slate-400"} />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isDragActive ? t("app.documents.dropActive") : t("app.documents.dropIdle")}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{t("app.documents.supportedFormats")}</p>
          </div>

          <div className="mt-2.5 flex items-center gap-1.5">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
              placeholder={t("app.documents.urlPlaceholder")}
              className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-2 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-accent"
            />
            <button
              onClick={handleUrlSubmit}
              disabled={!urlInput.trim()}
              aria-label={t("app.documents.addUrl")}
              className="shrink-0 rounded-lg bg-surface-3 p-1.5 text-slate-600 dark:text-slate-400 hover:bg-surface-4 disabled:opacity-30"
            >
              <LinkIcon size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {uploadErrors.length > 0 && (
          <div role="alert" className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                {t("app.documents.uploadRejected", { count: uploadErrors.length })}
              </p>
              {onDismissUploadErrors && (
                <button onClick={onDismissUploadErrors} aria-label={t("common.close")} className={iconButton}>
                  <X size={12} />
                </button>
              )}
            </div>
            <ul className="mt-1 space-y-0.5">
              {uploadErrors.map((e, i) => (
                <li key={`${e.name}-${i}`} className="text-[10px] text-red-600 dark:text-red-400">
                  <span className="font-medium">{e.name}</span> : {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {remaining > 0 && (
          <p aria-live="polite" className="mb-2 text-[10px] text-slate-500 dark:text-slate-400">
            {t("app.documents.indexingSummary", { count: remaining })}
          </p>
        )}
        {documents.length === 0 && (
          <p className="mt-6 text-center text-xs text-slate-600 dark:text-slate-400">{t("app.documents.empty")}</p>
        )}
        <div className="space-y-1.5">
          {documents.map((doc) => {
            const Icon = ICONS[doc.doc_type] || FileText;
            const indexing = doc.status === "pending" || doc.status === "processing";
            if (renamingId === doc.id) {
              return (
                <div key={doc.id} className="rounded-lg border border-accent bg-surface-2 px-2.5 py-2">
                  <div className="flex items-start gap-2">
                    <Icon size={14} className="mt-1 shrink-0 text-slate-500 dark:text-slate-400" />
                    <RenameField
                      initial={doc.name}
                      onCancel={() => setRenamingId(null)}
                      onSave={async (name) => {
                        await onRename(doc.id, name);
                        setRenamingId(null);
                      }}
                    />
                  </div>
                </div>
              );
            }
            return (
              <div
                key={doc.id}
                className="group rounded-lg border border-surface-border bg-surface-2 px-2.5 py-2"
                title={doc.error_message || doc.preview || undefined}
              >
                <div className="flex items-start gap-2">
                  <Icon size={14} className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-800 dark:text-slate-200">{doc.name}</p>
                    {indexing ? (
                      <IndexingProgress doc={doc} />
                    ) : (
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                        <StatusIcon status={doc.status} />
                        <span>{t(STATUS_LABELS[doc.status], { count: doc.chunk_count })}</span>
                        {doc.size_bytes > 0 && <span>· {formatBytes(doc.size_bytes)}</span>}
                      </div>
                    )}
                    {/* The reason was only in the hover tooltip - unreachable on touch screens. */}
                    {doc.status === "error" && doc.error_message && (
                      <p className="mt-0.5 line-clamp-3 text-[10px] text-red-500">{doc.error_message}</p>
                    )}
                    {doc.status === "error" && !readOnly && onRetry && (
                      <RetryButton onRetry={() => onRetry(doc.id)} />
                    )}
                  </div>
                  <button
                    onClick={() => onView(doc)}
                    aria-label={t("app.documents.view", { name: doc.name })}
                    title={t("app.documents.viewTitle")}
                    className={iconButton}
                  >
                    <Eye size={13} />
                  </button>
                  {canRename && !indexing && (
                    <button
                      onClick={() => setRenamingId(doc.id)}
                      aria-label={t("app.documents.rename", { name: doc.name })}
                      title={t("app.documents.renameTitle")}
                      className={iconButton}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {!readOnly && (
                    <button
                      onClick={() => onDelete(doc.id)}
                      aria-label={t("common.delete")}
                      className="shrink-0 rounded p-1 text-slate-500 dark:text-slate-400 opacity-0 hover:text-red-500 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
