import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { api } from "../../api/client";
import type { Testimonial } from "../../types";

export default function Testimonials() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Testimonial[]>([]);

  useEffect(() => {
    api.listTestimonials().then(setItems).catch(() => {});
  }, []);

  if (items.length === 0) return null;

  return (
    <section id="avis" className="border-t border-retro-border/60 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-retro-pink">
            {t("testimonials.eyebrow")}
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{t("testimonials.title")}</h2>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col rounded-2xl border border-retro-border bg-retro-panel/40 p-5">
              <div className="flex items-center gap-0.5 text-amber-400">
                {Array.from({ length: item.rating }).map((_, i) => (
                  <Star key={i} size={13} className="fill-amber-400" />
                ))}
              </div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-700">"{item.content}"</p>
              <div className="mt-4 border-t border-retro-border/60 pt-3">
                <p className="text-sm font-semibold text-slate-900">{item.author_name}</p>
                {(item.author_role || item.author_company) && (
                  <p className="text-xs text-slate-500">
                    {[item.author_role, item.author_company].filter(Boolean).join(" - ")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
