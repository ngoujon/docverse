import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Plus, Layers, ArrowLeft, LogOut } from "lucide-react";
import clsx from "clsx";
import type { Space } from "../types";
import { useAuth } from "../hooks/useAuth";

interface Props {
  spaces: Space[];
  activeSpaceId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default function SpaceRail({ spaces, activeSpaceId, onSelect, onCreate }: Props) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="flex w-[76px] shrink-0 flex-col items-center border-r border-surface-border bg-surface-1 py-4">
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 text-accent">
        <Layers size={18} />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-2">
        {spaces.map((s) => (
          <button
            key={s.id}
            title={s.name}
            onClick={() => onSelect(s.id)}
            className={clsx(
              "relative flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold text-white transition-all",
              activeSpaceId === s.id
                ? "ring-2 ring-offset-2 ring-offset-surface-1"
                : "opacity-70 hover:opacity-100"
            )}
            style={{
              backgroundColor: s.color,
              boxShadow: activeSpaceId === s.id ? `0 0 0 2px ${s.color}` : undefined,
            }}
          >
            {initials(s.name) || "?"}
          </button>
        ))}

        <button
          onClick={onCreate}
          title={t("app.spaceRail.newSpace")}
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-dashed border-surface-border text-slate-500 hover:border-accent hover:text-accent dark:text-slate-400"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => navigate("/")}
          title={t("common.backHome")}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-surface-3 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft size={17} />
        </button>
        <button
          onClick={() => {
            logout();
            navigate("/");
          }}
          title={t("dashboard.nav.logout")}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-red-500/10 hover:text-red-500 dark:text-slate-400"
        >
          <LogOut size={17} />
        </button>
      </div>
    </aside>
  );
}
