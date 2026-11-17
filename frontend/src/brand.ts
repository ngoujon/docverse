/**
 * Identite de marque, centralisee en un seul point.
 *
 * Le produit doit pouvoir etre renomme (nouveau nom commercial, nouveau
 * domaine) sans rechercher/remplacer dans tout le code : tout ce qui est
 * affiche a l'utilisateur passe par ici, et les valeurs sont surchargeables
 * a la construction via les variables VITE_BRAND_* (voir .env.example).
 *
 * A NE PAS confondre avec les cles localStorage ("hyaides:theme",
 * "hyaides:user-token"...) : celles-la sont volontairement figees. Les
 * renommer deconnecterait tous les utilisateurs existants et reinitialiserait
 * leurs preferences - c'est un identifiant technique, pas de la marque.
 */

// Each variable is read as a literal `process.env.VITE_...` so Next.js
// inlines its build-time value (see the `env` list in next.config.mjs);
// the VITE_ prefix is kept so existing deployment env files still apply.
export const BRAND = {
  /** Nom commercial affiche partout dans l'interface et les titres de page. */
  name: process.env.VITE_BRAND_NAME || "Docverse",
  /** Domaine public, utilise dans les meta, les liens canoniques et les emails. */
  domain: process.env.VITE_BRAND_DOMAIN || "localhost",
  /** Pays d'hebergement des donnees - argument commercial central. */
  hostingCountry: process.env.VITE_HOSTING_COUNTRY || "France",
  /** Hebergeur, cite dans les mentions legales et la page confidentialite. */
  hostingProvider: process.env.VITE_HOSTING_PROVIDER || "OVHcloud",
  /** Fournisseur du modele d'IA, cite dans la page produit. */
  aiProvider: process.env.VITE_AI_PROVIDER || "Mistral AI",
  /** Optional "site made by" credit in the landing page footer. */
  creditName: process.env.VITE_CREDIT_NAME || "",
  creditUrl: process.env.VITE_CREDIT_URL || "",
  /** Legal notice identity (publisher, publication director) - set per
   * deployment, never committed. */
  legalPublisher: (process.env.VITE_LEGAL_PUBLISHER || "").replace(/\\n/g, "\n"),
  legalDirector: (process.env.VITE_LEGAL_DIRECTOR || "").replace(/\\n/g, "\n"),
} as const;

/** Titre de page normalise : "Section - Marque". */
export function pageTitle(section?: string): string {
  return section ? `${section} - ${BRAND.name}` : BRAND.name;
}
