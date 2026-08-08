import { Link } from "react-router-dom";
import { ArrowLeft, Cookie, Database, Mail, ShieldCheck } from "lucide-react";

const SECTIONS = [
  {
    icon: Cookie,
    title: "Cookies",
    body: "Ce site n'utilise aucun cookie de suivi ni de mesure d'audience, et aucun cookie tiers/publicitaire. Aucun bandeau de consentement n'est donc necessaire : il n'y a rien a consentir.",
  },
  {
    icon: Database,
    title: "Stockage local (localStorage)",
    body: "Lorsque vous deverrouillez un espace de travail protege par mot de passe, un jeton d'acces temporaire est enregistre dans le stockage local de votre navigateur (localStorage), uniquement pour eviter de ressaisir le mot de passe a chaque page. Il n'est jamais transmis a un tiers et expire automatiquement. Vous pouvez l'effacer a tout moment en videant les donnees du site dans votre navigateur.",
  },
  {
    icon: ShieldCheck,
    title: "Vos documents et conversations",
    body: "Les documents que vous deposez, leur contenu indexe et vos conversations restent stockes uniquement sur le serveur qui heberge cette instance (base de donnees et base vectorielle locales). Rien n'est envoye a un service d'IA cloud tiers : le traitement (lecture, indexation, generation des reponses) est effectue localement via Ollama.",
  },
  {
    icon: Mail,
    title: "Formulaire de contact",
    body: "Si vous utilisez le formulaire de contact, votre nom, votre email et votre message sont conserves afin de pouvoir vous repondre. Ces informations ne sont ni revendues ni partagees avec des tiers, et ne servent a aucune prospection commerciale.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-retro-bg px-4 py-12 font-sans text-slate-200 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-slate-500 hover:text-retro-cyan"
        >
          <ArrowLeft size={14} /> Retour a l'accueil
        </Link>

        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-retro-pink">
          Confidentialite
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-100 sm:text-3xl">
          Cookies et donnees personnelles
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          Ce projet est concu pour etre local et prive par defaut. Voici,
          simplement, ce qui est stocke et pourquoi.
        </p>

        <div className="mt-10 space-y-6">
          {SECTIONS.map((s) => (
            <div
              key={s.title}
              className="rounded-2xl border border-retro-border bg-retro-panel/40 p-5"
            >
              <div className="flex items-center gap-2">
                <s.icon size={17} className="text-retro-cyan" />
                <h2 className="text-sm font-semibold text-slate-100">{s.title}</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-xs text-slate-600">
          Cette page decrit le fonctionnement du logiciel tel que fourni.
          L'organisation qui heberge cette instance reste responsable du
          traitement des donnees qu'elle collecte via ce site.
        </p>
      </div>
    </div>
  );
}
