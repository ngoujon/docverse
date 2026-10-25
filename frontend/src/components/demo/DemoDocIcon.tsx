import { AudioLines, FileSpreadsheet, FileText, FileType2, Globe, Image, NotebookText } from "lucide-react";
import type { DemoDocType } from "./types";

const ICONS = {
  pdf: FileText,
  docx: FileType2,
  image: Image,
  web: Globe,
  audio: AudioLines,
  csv: FileSpreadsheet,
  md: NotebookText,
} satisfies Record<DemoDocType, unknown>;

// Tinted square per family, so the list reads at a glance.
const TONES: Record<DemoDocType, string> = {
  pdf: "bg-red-50 text-red-600",
  docx: "bg-blue-50 text-blue-600",
  image: "bg-amber-50 text-amber-600",
  web: "bg-sky-50 text-sky-600",
  audio: "bg-fuchsia-50 text-fuchsia-600",
  csv: "bg-emerald-50 text-emerald-600",
  md: "bg-slate-100 text-slate-600",
};

export default function DemoDocIcon({ type, size = "md" }: { type: DemoDocType; size?: "sm" | "md" }) {
  const Icon = ICONS[type];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg ${TONES[type]} ${size === "sm" ? "h-6 w-6" : "h-8 w-8"}`}
    >
      <Icon size={size === "sm" ? 13 : 16} />
    </span>
  );
}
