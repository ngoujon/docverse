import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import { BRAND } from "./brand";

import fr from "./locales/fr.json";
import en from "./locales/en.json";
import de from "./locales/de.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import it from "./locales/it.json";

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
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      de: { translation: de },
      es: { translation: es },
      pt: { translation: pt },
      it: { translation: it },
    },
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

export default i18n;
