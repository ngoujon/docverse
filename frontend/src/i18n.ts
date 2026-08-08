import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

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
      lookupLocalStorage: "open-rag:lang",
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
