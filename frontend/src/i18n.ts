/** i18next setup: six bundled languages, browser/localStorage detection,
 * and brand values injected as default interpolation variables. */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import { BRAND } from "./brand";

// Only French (the default and fallback) ships in the main bundle: each
// language file weighs ~70 kB and the six of them made up most of the
// JavaScript every visitor downloaded. The others load on demand.
import fr from "./locales/fr.json";

const LOADERS: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import("./locales/en.json"),
  de: () => import("./locales/de.json"),
  es: () => import("./locales/es.json"),
  pt: () => import("./locales/pt.json"),
  it: () => import("./locales/it.json"),
};

export const SUPPORTED_LANGUAGES = [
  { code: "fr", label: "Francais" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Espanol" },
  { code: "pt", label: "Portugues" },
  { code: "it", label: "Italiano" },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { fr: { translation: fr } },
    fallbackLng: "fr",
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    nonExplicitSupportedLngs: true,
    detection: {
      // Explicit user choice (saved in localStorage) wins; otherwise fall
      // back to the browser language; otherwise French.
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "hyaides:lang",
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
      // Le nom du produit, le domaine et les partenaires ne sont jamais
      // ecrits en dur dans les traductions : elles utilisent {{brand}},
      // {{domain}}, etc. Un renommage se fait donc en changeant les
      // VITE_BRAND_* au build, sans retoucher les six fichiers de langue.
      defaultVariables: {
        brand: BRAND.name,
        domain: BRAND.domain,
        aiProvider: BRAND.aiProvider,
        hostingCountry: BRAND.hostingCountry,
        hostingProvider: BRAND.hostingProvider,
      },
    },
  });

/** Loads a language's translations if they aren't there yet. Resolves once
 * the language can be displayed (unknown codes resolve immediately and
 * fall back to French). */
export async function loadLanguage(lng: string | undefined): Promise<void> {
  const code = (lng || "fr").slice(0, 2);
  if (!LOADERS[code] || i18n.hasResourceBundle(code, "translation")) return;
  try {
    const mod = await LOADERS[code]();
    i18n.addResourceBundle(code, "translation", mod.default, true, true);
  } catch {
    // Network hiccup: the page stays in French rather than breaking.
  }
}

// Switching language (LanguageSwitcher) or a detected browser language:
// fetch the file, then re-apply the language so every component re-renders
// with the real strings.
i18n.on("languageChanged", (lng) => {
  const code = (lng || "").slice(0, 2);
  if (LOADERS[code] && !i18n.hasResourceBundle(code, "translation")) {
    void loadLanguage(code).then(() => {
      if (i18n.hasResourceBundle(code, "translation")) void i18n.changeLanguage(lng);
    });
  }
});

export default i18n;
