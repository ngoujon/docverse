import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { api } from "../../api/client";
import type { Testimonial } from "../../types";

/** Published customer testimonials; the section hides itself when empty. */
export default function Testimonials() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Testimonial[]>([]);

  useEffect(() => {
    api
      .listTestimonials()
      .then(setItems)
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  return (
    <section id="avis" className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold text-fluent-indigo">{t("testimonials.eyebrow")}</p>
        <h2 className="mt-3 max-w-3xl text-balance text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.025em] text-fluent-navy sm:text-4xl lg:max-w-none">
          {t("testimonials.title")}
        </h2>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <figure
              key={item.id}
              className="flex flex-col rounded-xl border border-fluent-line bg-white p-6 shadow-card"
            >
              <div className="flex items-center gap-0.5 text-amber-400">
                {Array.from({ length: item.rating }).map((_, i) => (
                  <Star key={i} size={14} className="fill-amber-400" />
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-fluent-navy">
                “{item.content}”
              </blockquote>
              <figcaption className="mt-5 border-t border-fluent-line pt-4">
                <p className="text-sm font-semibold text-fluent-navy">{item.author_name}</p>
                {(item.author_role || item.author_company) && (
                  <p className="text-sm text-fluent-muted">
                    {[item.author_role, item.author_company].filter(Boolean).join(" · ")}
                  </p>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
