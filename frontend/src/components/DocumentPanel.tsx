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
} from "lucide-react";
import clsx from "clsx";
import type { DocumentItem } from "../types";

interface Props {
  documents: DocumentItem[];
  onUpload: (files: File[]) => void;
  onIngestUrl: (url: string) => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
}

const ICONS: Record<DocumentItem["doc_type"], any> = {
  pdf: FileText,
  image: ImageIcon,
  url: LinkIcon,
  docx: FileType,
  txt: FileText,
  md: FileText,
};

function StatusIcon({ status }: { status: DocumentItem["status"] }) {
  if (status === "ready") return <CheckCircle2 size={14} className="text-emerald-500" />;
  if (status === "error") return <AlertCircle size={14} className="text-red-500" />;
  if (status === "processing")
    return <Loader2 size={14} className="animate-spin text-accent" />;
  return <Clock size={14} className="text-slate-500 dark:text-slate-400" />;
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentPanel({
  documents,
  onUpload,
  onIngestUrl,
  onDelete,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [urlInput, setUrlInput] = useState("");

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length) onUpload(accepted);
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
      "text/markdown": [".md"],
    },
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
            className="shrink-0 rounded-lg p-1 text-slate-500 dark:text-slate-400 hover:bg-surface-3 hover:text-slate-700 dark:hover:text-slate-200 lg:hidden"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="p-3">
        <div
          {...getRootProps()}
          className={clsx(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-6 text-center transition-colors",
            isDragActive
              ? "border-accent bg-accent/10"
              : "border-surface-border hover:border-slate-400 dark:hover:border-slate-600 hover:bg-surface-2"
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
            className="shrink-0 rounded-lg bg-surface-3 p-1.5 text-slate-600 dark:text-slate-400 hover:bg-surface-4 disabled:opacity-30"
          >
            <LinkIcon size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {documents.length === 0 && (
          <p className="mt-6 text-center text-xs text-slate-600 dark:text-slate-400">{t("app.documents.empty")}</p>
        )}
        <div className="space-y-1.5">
          {documents.map((doc) => {
            const Icon = ICONS[doc.doc_type] || FileText;
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
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                      <StatusIcon status={doc.status} />
                      <span>
                        {doc.status === "ready" &&
                          t("app.documents.statusReady", { count: doc.chunk_count })}
                        {doc.status === "pending" && t("app.documents.statusPending")}
                        {doc.status === "processing" && t("app.documents.statusProcessing")}
                        {doc.status === "error" && t("app.documents.statusError")}
                      </span>
                      {doc.size_bytes > 0 && <span>· {formatSize(doc.size_bytes)}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => onDelete(doc.id)}
                    className="shrink-0 rounded p-1 text-slate-500 dark:text-slate-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
