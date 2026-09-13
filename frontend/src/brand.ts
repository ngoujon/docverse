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

const env = import.meta.env;

export const BRAND = {
  /** Nom commercial affiche partout dans l'interface et les titres de page. */
  name: env.VITE_BRAND_NAME || "Hyaides",
  /** Domaine public, utilise dans les meta, les liens canoniques et les emails. */
  domain: env.VITE_BRAND_DOMAIN || "example.com",
  /** Pays d'hebergement des donnees - argument commercial central. */
  hostingCountry: env.VITE_HOSTING_COUNTRY || "France",
  /** Hebergeur, cite dans les mentions legales et la page confidentialite. */
  hostingProvider: env.VITE_HOSTING_PROVIDER || "OVHcloud",
  /** Fournisseur du modele d'IA, cite dans la page produit. */
  aiProvider: env.VITE_AI_PROVIDER || "Mistral AI",
} as const;

/** Titre de page normalise : "Section - Marque". */
export function pageTitle(section?: string): string {
  return section ? `${section} - ${BRAND.name}` : BRAND.name;
}

export default BRAND;
