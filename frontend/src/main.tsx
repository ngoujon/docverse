import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";
import "./i18n";
import "./index.css";

// Sciemment createRoot, pas hydrateRoot, malgre le HTML deja rendu par
// scripts/prerender.mjs pour les routes publiques (voir entry-server.tsx).
// Tente : hydrateRoot echoue en prod avec des erreurs d'hydratation sur au
// moins un noeud (ex. le lien /login de LandingPage, "Connexion " avec un
// espace final cote SSR contre "Connexion" sans cote client) - le rendu
// serveur passe par vite.ssrLoadModule (transform dev/Babel) alors que le
// bundle client passe par vite build (transform prod/esbuild), et les deux
// ne traitent pas toujours l'espace final d'un JSX `{expr} <Icone/>` de la
// meme facon. React recupere (il rejette le DOM serveur et rerend), donc ce
// n'est pas un bug visible pour l'utilisateur, mais ca pollue la console en
// prod pour rien. A revisiter si tout le JSX public passe a un `{" "}`
// explicite plutot qu'un espace litteral avant une icone, ou si le
// prerender est aligne sur le meme pipeline de build que le client.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
