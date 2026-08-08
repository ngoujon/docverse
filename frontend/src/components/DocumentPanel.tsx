import { useCallback, useState } from "react";
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
  return <Clock size={14} className="text-slate-500" />;
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function DocumentPanel({
  documents,
  onUpload,
  onIngestUrl,
  onDelete,
  onClose,
}: Props) {
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
          <h2 className="text-sm font-semibold text-slate-900">Documents de l'espace</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Ajoutez des fichiers ou des liens que le chatbot pourra consulter.
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-slate-500 hover:bg-surface-3 hover:text-slate-700 lg:hidden"
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
              : "border-surface-border hover:border-slate-400 hover:bg-surface-2"
          )}
        >
          <input {...getInputProps()} />
          <UploadCloud size={22} className={isDragActive ? "text-accent" : "text-slate-500"} />
          <p className="text-xs text-slate-500">
            {isDragActive ? "Deposez les fichiers ici" : "Glissez-deposez ou cliquez"}
          </p>
          <p className="text-[10px] text-slate-500">PDF, images, DOCX, TXT, Markdown</p>
        </div>

        <div className="mt-2.5 flex items-center gap-1.5">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
            placeholder="Coller un lien (https://...)"
            className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-2 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-accent"
          />
          <button
            onClick={handleUrlSubmit}
            disabled={!urlInput.trim()}
            className="shrink-0 rounded-lg bg-surface-3 p-1.5 text-slate-600 hover:bg-surface-4 disabled:opacity-30"
          >
            <LinkIcon size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {documents.length === 0 && (
          <p className="mt-6 text-center text-xs text-slate-600">Aucun document pour l'instant.</p>
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
                  <Icon size={14} className="mt-0.5 shrink-0 text-slate-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-800">{doc.name}</p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                      <StatusIcon status={doc.status} />
                      <span>
                        {doc.status === "ready" && `${doc.chunk_count} extraits`}
                        {doc.status === "pending" && "En attente"}
                        {doc.status === "processing" && "Analyse en cours..."}
                        {doc.status === "error" && "Erreur"}
                      </span>
                      {doc.size_bytes > 0 && <span>· {formatSize(doc.size_bytes)}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => onDelete(doc.id)}
                    className="shrink-0 rounded p-1 text-slate-500 opacity-0 hover:text-red-500 group-hover:opacity-100"
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
