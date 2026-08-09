import { Sun, Moon } from "lucide-react";

interface Props {
  theme: "light" | "dark";
  onToggle: () => void;
}

export default function ThemeToggle({ theme, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      title={theme === "dark" ? "Theme clair" : "Theme sombre"}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
