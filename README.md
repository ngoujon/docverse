# Docverse

Solution cloud **RAG souveraine** : discutez avec une IA a propos de vos
propres documents (PDF, images/scans, fichiers audio transcrits
automatiquement, pages web, DOCX, TXT/Markdown), sur une chaine de
traitement entierement europeenne.

- **Hebergement en France**, chez OVHcloud.
- **Moteur d'IA francais** : l'API [Mistral AI](https://mistral.ai)
  (chat, vision, embeddings), facturee a l'usage. Aucune requete d'IA ne
  sort de l'Union europeenne.
- **Transcription audio locale** (Whisper) : les fichiers audio ne
  quittent jamais le serveur, pas meme vers Mistral.
- **Recherche web auto-hebergee** (SearXNG) pour completer les reponses
  avec de l'information recente, sans cle API ni traceur commercial.
- **Aucun entrainement sur vos donnees.**

Pense pour les structures qui gerent plusieurs clients ou dossiers
(cabinets, agences, equipes projet) : chaque espace de travail est
cloisonne, avec des roles et un acces revocable, et appartient a un
palier d'abonnement qui determine ses limites (nombre d'espaces, membres
par espace, stockage) - les questions posees a l'IA, elles, sont
illimitees sur tous les paliers.

## Fonctionnalites

### Comptes et acces

- **Comptes utilisateur obligatoires** : inscription email/mot de passe
  (avec captcha "preuve de travail" auto-heberge et verification d'email),
  connexion, mot de passe oublie, authentification a deux facteurs (2FA)
  optionnelle. Un lien de partage ne dispense plus d'avoir un compte -
  meme un visiteur invite doit se connecter ou en creer un.
- **Connexion Google (SSO)** en plus de l'email/mot de passe - le bouton
  n'apparait que si le fournisseur est reellement configure. Le code pour
  Sign in with Apple est pret mais reste inactif tant que l'app n'a pas de
  nom de domaine HTTPS et de compte Apple Developer payant ; Microsoft a
  ete retire (aucun tenant Azure disponible pour l'instant).
- **Paliers d'abonnement** (Decouverte / Particulier / Pro / Entreprise) :
  chaque palier limite reellement le nombre d'espaces de travail possedes,
  le nombre de membres par espace et le stockage par espace (voir
  `PLAN_QUOTAS` dans `backend/app/config.py`) - aucune limite en revanche
  sur le nombre de questions posees a l'IA. Paiement et gestion
  d'abonnement via Stripe (Checkout, portail de facturation,
  synchronisation par webhook).
- **RGPD** : export et suppression de compte en libre-service,
  desabonnement newsletter en un clic, page confidentialite dediee.

### Espaces de travail et documents

- **Espaces de travail** cloisonnes : chaque espace a ses propres documents
  et ses propres conversations. Aucune donnee n'est partagee entre espaces.
  Une conversation appartient toujours a un seul espace.
- **Plusieurs conversations par espace**, avec historique persistant.
- **Ingestion multi-format** : PDF (texte natif + OCR automatique par IA de
  vision pour les PDF scannes), images (JPG/PNG/WEBP...), fichiers audio
  (MP3/WAV/M4A/OGG/FLAC/WEBM), pages web (extraction du contenu principal),
  DOCX, TXT, Markdown.
- **Lecture d'images par IA** : les documents images ou les pages de PDF
  scannees sont transcrits/decrits par le modele multimodal de Mistral
  (par defaut `mistral-medium-latest`), puis indexes comme du texte normal.
- **Transcription audio** : les fichiers audio sont transcrits localement
  via Whisper (`faster-whisper`, modele telecharge une seule fois dans le
  volume de donnees) puis indexes comme du texte normal - aucun appel a un
  service cloud pour cette etape.
- **Quotas de stockage reellement appliques** par palier (200 Mo / 2 Go /
  10 Go par espace), en plus des quotas d'espaces et de membres.
- **Delai de securite avant reinvitation** : un membre retire d'un espace
  ne peut pas y etre readdicte avant quelques heures (configurable via
  `MEMBER_REINVITE_COOLDOWN_HOURS`), pour empecher de contourner le quota
  de membres par espace.
- **RAG (Retrieval-Augmented Generation)** : chaque question est enrichie
  avec les passages les plus pertinents des documents de l'espace
  (recherche vectorielle via ChromaDB + embeddings `mistral-embed`), et citee dans
  la reponse (`[1]`, `[2]`, ...).
- **Recherche web optionnelle** (bouton par conversation) : complete le
  contexte avec des resultats d'un moteur de recherche local (SearXNG),
  sans tracking et sans cle API.
- **Partage par role** : un lien de partage donne acces a un espace en
  lecture seule ou en edition, mais uniquement a une personne connectee -
  le nombre de membres par espace reste limite par le palier du proprietaire.

### Interface

- **Interface claire (neo-retro), ergonomique et responsive**
  (mobile/tablette/desktop), avec zones de glisser-deposer pour l'ajout de
  documents, statut de traitement en temps reel, reponses en streaming
  avec un effet de fondu mot a mot (chat de l'app comme assistant d'aide
  de la page d'accueil).
- **Multilingue** : francais (par defaut), anglais, allemand, espagnol,
  portugais, italien. Detection automatique de la langue du navigateur,
  avec selecteur manuel (memorise).
- **Theme clair/sombre** avec bascule reelle (pas seulement suivre l'OS).
- **Limitation des appels simultanes a l'IA** : les appels a l'API
  Mistral sont plafonnes pour ne pas declencher ses erreurs 429 (quota).
  L'inference n'etant plus hebergee ici, ce n'est plus une protection du
  serveur (voir `LLM_MAX_CONCURRENCY`).
- **Site marketing** (page d'accueil neo-retro, FAQ, formulaire de
  contact, assistant conversationnel d'aide) distinct de l'application
  elle-meme.

## Architecture

```
frontend (React + Vite)
   │  /api  → proxy
   ▼
backend (FastAPI)
   ├── SQLite            → espaces, conversations, messages, documents
   ├── ChromaDB (local)  → base vectorielle (une collection par espace)
   ├── API Mistral       → chat, vision (OCR/description d'images), embeddings
   ├── Whisper (local)   → transcription audio, sans appel externe
   └── SearXNG           → recherche web locale (optionnelle)
```

Deux variantes de la stack sont fournies :

- **`docker-compose.yml`** (par defaut) : mode **developpement**, avec
  rechargement a chaud. Le frontend tourne avec le serveur de dev Vite
  (port **3000**) et le backend avec `uvicorn --reload` : le code source
  est monte en volume, donc modifier un fichier dans `frontend/src` ou
  `backend/app` se repercute immediatement dans le navigateur, **sans
  rebuild ni redemarrage de conteneur**.
- **`docker-compose.prod.yml`** : mode **production**, frontend compile et
  servi par Nginx (port 8080 par defaut), sans montage de code ni outillage
  de dev. A utiliser pour un vrai deploiement (VPS, etc.).

## Prerequis

- Docker et Docker Compose
- Une cle API Mistral (`MISTRAL_API_KEY`), a creer sur
  <https://console.mistral.ai/>. **Obligatoire** : sans elle, le chat et
  l'indexation de documents echouent.
- Aucun GPU requis, et quelques centaines de Mo de disque suffisent :
  plus aucun modele de langage n'est heberge localement. Seul le modele
  Whisper (~500 Mo pour `small`) est telecharge, pour la transcription
  audio.

## Demarrage (developpement, avec hot-reload)

```bash
cp .env.example .env
# Ajustez les modeles dans .env si besoin (voir "Choix des modeles" ci-dessous)

docker compose up -d --build
```

L'application est immediatement disponible sur :

- **Page d'accueil** : http://localhost:3000
- **Application (espaces/chat)** : http://localhost:3000/app
- **API backend** (debug) : http://localhost:8000/api/health

Ce `docker compose up` initial (avec `--build`) est le seul rebuild
necessaire : ensuite, tant que vous ne touchez pas a `requirements.txt` ou
`package.json`, les modifications de code (frontend comme backend) sont
prises en compte automatiquement grace au montage de volume + hot-reload,
il suffit de recharger la page.

## Deploiement (production)

En local (sans domaine ni HTTPS) :

```bash
cp .env.example .env
docker compose -f docker-compose.prod.yml up -d --build
```

Interface disponible sur http://localhost:8080 (ou `FRONTEND_PORT`). Cette
variante compile le frontend une bonne fois pour toutes (image Nginx) : il
faut relancer `--build` a chaque changement de code.

### Deploiement sur un VPS avec nom de domaine

`docker-compose.prod.yml` inclut Caddy, qui obtient et renouvelle
automatiquement un certificat HTTPS (Let's Encrypt) pour le domaine
configure - aucune manipulation de certificat a faire a la main.

Deux scripts dans `tools/` automatisent le deploiement depuis cette
machine (aucune commande a taper sur le VPS) :

```bash
cp tools/deploy.env.example tools/deploy.env   # SSH, domaine, chemin distant
cp .env.example tools/production.env           # vrais secrets de production

tools/deploy.sh   # premier deploiement complet (installe Docker si besoin,
                   # clone le depot, envoie le .env, demarre la stack)
tools/update.sh   # mises a jour suivantes (git pull + rebuild sur le VPS)
```

Prerequis avant `deploy.sh` : le DNS du domaine doit deja pointer (A/AAAA)
vers l'IP du VPS, sinon Caddy ne pourra pas valider le certificat.
`tools/deploy.env` et `tools/production.env` contiennent des secrets et ne
sont jamais commites (voir `.gitignore`).

## Environnement de staging

`docker-compose.staging.yml` reprend exactement la meme forme que
`docker-compose.prod.yml` (frontend pre-compile servi par Nginx, Caddy en
entree HTTPS) mais avec son propre nom de projet, ses propres volumes et
des ports differents (`8081`/`8443` au lieu de `8080`/`443`) : il peut donc
tourner sur la meme machine que la prod sans collision. C'est l'etape ou
l'on valide un changement dans des conditions proches du reel avant de
le pousser en production.

```bash
cp .env.staging .env.staging.local   # completez les secrets localement
docker compose -f docker-compose.staging.yml --env-file .env.staging.local up -d --build
```

Interface disponible sur http://localhost:8081 (ou via Caddy sur le
sous-domaine `DOMAIN`, par defaut `example.com`). Utilisez des
comptes de test partout ou c'est possible (Stripe en mode test, apps
OAuth dediees "staging") : ne jamais reutiliser des identifiants ou des
secrets de production ici.

### Workflow dev -> staging -> prod

1. **Dev** (`docker-compose.yml`) : hot-reload, base et modeles locaux,
   iteration rapide sur le code (voir "Demarrage (developpement)"
   ci-dessus).
2. **Staging** (`docker-compose.staging.yml`) : image compilee comme en
   prod, memes variables d'environnement (issues de `.env.staging`), mais
   isolee (volumes, ports, domaine et secrets propres). On y verifie
   qu'un changement se comporte bien une fois construit "pour de vrai"
   (build Docker complet, pas de bind mount, vrais emails/paiements en
   mode test) avant d'y toucher en production.
3. **Prod** (`docker-compose.prod.yml`) : une fois valide en staging, le
   meme changement est deploye en production via `tools/update.sh` (ou
   `tools/deploy.sh` pour un premier deploiement).

Les fichiers `.env.staging` et `.env.example` doivent rester synchronises
quand une nouvelle variable d'environnement est ajoutee au backend, pour
que le staging reste representatif de la prod.

## Choix des modeles

Modifiables dans `.env`, sans redemarrage d'infrastructure : les modeles
sont heberges par Mistral, il n'y a plus rien a telecharger.

| Variable                | Role                           | Suggestions                                              |
|-------------------------|--------------------------------|----------------------------------------------------------|
| `MISTRAL_CHAT_MODEL`    | Conversation / raisonnement    | `mistral-large-latest`, `mistral-small-latest` (~8x moins cher) |
| `MISTRAL_VISION_MODEL`  | Lecture d'images / PDF scannes | `mistral-medium-latest`, `mistral-small-latest`                    |
| `MISTRAL_EMBED_MODEL`   | Indexation vectorielle         | `mistral-embed`                                          |
| `WHISPER_MODEL_SIZE`    | Transcription audio (locale, jamais envoyee a Mistral) | `small` (par defaut), `base` (plus rapide/moins precis), `medium` |

> **Attention au modele d'embeddings** : en changer modifie la dimension
> des vecteurs et rend l'index existant inexploitable. Il faut alors vider
> la base vectorielle et reindexer tous les documents.

Le modele de chat et celui de vision peuvent etre changes a tout moment
sans perdre vos documents deja indexes : seules la generation des reponses
et la lecture d'images utilisent le modele configure au moment de l'appel.
Le modele Whisper, lui, est telecharge une seule fois (dans le volume
`app_data`) au premier fichier audio uploade, pas au demarrage.

## Utilisation

1. Depuis la page d'accueil, **creez un compte** (ou connectez-vous avec
   Google) puis cliquez sur **Lancer l'application** (ou allez directement
   sur `/app`).
2. Creez un **espace de travail** (bouton `+` dans la colonne de gauche) :
   nom, description, couleur. Le nombre d'espaces que vous pouvez creer et
   le nombre de membres par espace dependent de votre palier d'abonnement.
3. Dans le panneau **Documents** (a droite), glissez-deposez vos fichiers
   ou collez un lien web. Le statut passe de *en attente* → *analyse en
   cours* → *pret* (ou *erreur* avec le detail au survol).
4. Creez une **conversation** dans cet espace et posez vos questions. Les
   reponses citent les extraits de documents utilises.
5. Activez **Recherche web** en haut de la conversation pour completer les
   reponses avec des sources en ligne (recherchees via SearXNG, en local).
6. Utilisez le bouton **partager** dans l'en-tete de l'espace pour generer
   un lien donnant acces en lecture seule ou en edition ; la personne qui
   ouvre le lien doit etre connectee (ou creer un compte) pour y acceder.
7. Creez d'autres espaces pour des sujets differents : leurs documents et
   conversations restent totalement isoles les uns des autres.

## Charge et securite (important pour un petit serveur)

Cette application tourne confortablement sur un VPS modeste (2 vCPU) :
l'inference etant deportee chez Mistral, le serveur ne fait plus que de
l'orchestration, du stockage et de la recherche vectorielle.

- **Plafond d'appels simultanes** (`LLM_MAX_CONCURRENCY`, defaut `8`) :
  les appels a l'API Mistral passent par une file globale cote backend.
  Ce n'est plus une protection du serveur mais un garde-fou contre les
  erreurs 429 (quota) du fournisseur ; baissez la valeur si vous en voyez
  dans les logs.
- **Limitation de debit** sur le formulaire de contact, la connexion, et
  l'envoi de messages, pour limiter les abus.
- **Mots de passe utilisateur** stockes uniquement sous forme hachee
  (bcrypt) ; l'acces est ensuite verifie via un jeton de session signe
  (JWT), jamais via le mot de passe en clair.
- **En-tetes de securite** (X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, Permissions-Policy) et CORS restreint via
  `CORS_ORIGINS` (mettez votre nom de domaine en production).
- Pensez a definir `SECRET_KEY` dans `.env` en production (sinon une cle
  temporaire est generee a chaque redemarrage et toutes les sessions sont
  invalidees).
- **Protection SSRF** sur l'ingestion de liens et la recherche web : avant
  toute requete sortante, l'adresse IP resolue du lien est verifiee et les
  plages privees/loopback/link-local (ex. `169.254.169.254`, `localhost`,
  les services Docker internes) sont bloquees, y compris a travers les
  redirections HTTP.
- **Ports internes non exposes publiquement en production**
  (`docker-compose.prod.yml`) : l'API backend (8000, debug) est liee a
  `127.0.0.1` par defaut - seul le frontend (Nginx) est cense etre expose
  sur Internet.
- **Cle API Mistral cote serveur uniquement** : elle ne transite jamais
  par le navigateur, aucun appel a Mistral n'est fait depuis le frontend.
- Le limiteur de debit identifie le vrai client via l'en-tete `X-Real-IP`
  positionne par Nginx (non falsifiable par l'appelant), pas via
  `X-Forwarded-For` seul qui peut etre manipule.

## Sauvegardes et restauration

Deux niveaux de sauvegarde coexistent :

### 1. Sauvegardes automatiques par espace (integrees a l'app)

Chaque espace de travail a son propre historique de sauvegardes, gere par
`backend/app/services/backup.py` :

- **Declenchement opportuniste** : une sauvegarde est creee automatiquement
  des qu'il y a de l'activite dans un espace (message envoye, document
  ingere), mais **au maximum une fois par jour** par espace, pour ne pas
  multiplier les copies inutilement.
- **Contenu** : toutes les lignes SQL de l'espace (conversations, messages,
  documents) au format JSON, plus un dump de sa collection ChromaDB
  (embeddings + metadonnees) et les fichiers uploades associes.
- **Retention glissante de 7 jours** : a chaque nouvelle sauvegarde, celles
  de plus de 7 jours pour cet espace sont supprimees automatiquement
  (`_prune()`), pour eviter que le volume de donnees ne grossisse sans
  limite sur un petit serveur.
- **Restauration** : reservee aux administrateurs de l'instance, depuis le
  dashboard admin (`/admin` -> onglet Espaces -> icone historique). Une
  restauration remplace integralement le contenu actuel de l'espace
  (conversations, documents, vecteurs) par celui de la sauvegarde
  selectionnee ; l'operation est irreversible (une confirmation est
  demandee). Un admin peut aussi declencher une sauvegarde manuelle
  immediate ("Creer une sauvegarde maintenant") avant une operation
  risquee.
- **Suppression d'espace** : toutes les sauvegardes associees sont
  supprimees en meme temps que l'espace (pas de retention orpheline).

Ce systeme protege contre les erreurs applicatives ou humaines (mauvaise
manipulation, document corrompu, suppression accidentelle de conversations)
mais **ne remplace pas** une sauvegarde du volume Docker lui-meme : si le
disque du serveur est perdu, il faut la sauvegarde niveau infrastructure
ci-dessous.

### 2. Sauvegarde du volume Docker (niveau infrastructure)

Toutes les donnees (SQLite, ChromaDB, fichiers uploades, y compris les
sauvegardes par espace ci-dessus) vivent dans le volume Docker nomme
`app_data`, monte sur `/data` dans le conteneur backend. Pour une
sauvegarde complete independante de l'application (a planifier en cron sur
le serveur hote) :

```bash
# Sauvegarde (l'app peut rester en marche : SQLite gere les lectures
# concurrentes, mais pour une coherence stricte, un arret bref est plus sur)
docker run --rm \
  -v docverse_app_data:/data:ro \
  -v "$(pwd)/backups":/backup \
  alpine tar czf /backup/docverse-data-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .

# Restauration (ecrase les donnees actuelles du volume - a faire conteneurs arretes)
docker compose down
docker run --rm \
  -v docverse_app_data:/data \
  -v "$(pwd)/backups":/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/docverse-data-XXXXXXXX-XXXXXX.tar.gz -C /data"
docker compose up -d
```

Adaptez `docverse_app_data` au nom reel du volume (`docker volume ls`) si
le projet n'est pas dans un dossier nomme `docverse`. Conservez ces
archives hors du serveur (stockage objet, autre machine) : une sauvegarde
qui vit sur le meme disque que les donnees d'origine ne protege pas contre
une panne disque.

## SEO

La page d'accueil et la page confidentialite portent des balises meta
(titre, description, Open Graph, donnees structurees JSON-LD) et un
`robots.txt`/`sitemap.xml` (`frontend/public/`). **Avant un vrai
deploiement**, remplacez `REPLACE_WITH_YOUR_DOMAIN` dans
`frontend/public/sitemap.xml` par votre nom de domaine reel, et completez
`og:url` dans `frontend/index.html` si besoin. L'application etant une
SPA (rendu cote client), son referencement par des robots qui n'executent
pas JavaScript reste limite ; un rendu cote serveur (SSR/prerendering)
serait necessaire pour aller plus loin, ce qui depasse le cadre actuel.

## Developpement sans Docker (optionnel)

Backend :

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export MISTRAL_API_KEY=...        # obligatoire
export SEARXNG_BASE_URL=http://localhost:8081
export DATA_DIR=./data
uvicorn app.main:app --reload --port 8000
```

Frontend :

```bash
cd frontend
npm install
VITE_API_PROXY_TARGET=http://localhost:8000 npm run dev
```

## Depannage

- **"IA injoignable"** (point rouge dans la colonne de gauche) : verifiez
  que `MISTRAL_API_KEY` est renseignee et valide. Le detail de l'erreur
  est renvoye par `GET /api/admin/health` (session admin requise).
- **Documents bloques en "En attente"** : regardez `docker compose logs
  backend` — le plus souvent une cle API absente, un quota Mistral
  depasse (429) ou un solde epuise.
- **Reponses lentes** : essayez `mistral-small-latest`, nettement plus
  rapide et moins cher que `mistral-large-latest`.
- **Recherche web sans resultat** : verifiez `docker compose logs searxng`.
- **Deconnecte de facon inattendue** : le jeton de session est stocke dans
  le navigateur (localStorage) ; si vous changez de navigateur/appareil ou
  videz les donnees du site, vous devrez vous reconnecter. Idem si le
  backend a redemarre sans `SECRET_KEY` fixe dans `.env` (une cle
  temporaire est alors regeneree, invalidant toutes les sessions).
- **"En file d'attente" reste affiche longtemps** : `LLM_MAX_CONCURRENCY`
  est peut-etre trop bas pour votre trafic - les requetes sont traitees
  dans l'ordre d'arrivee.
- **Mes changements de code n'apparaissent pas** : en mode developpement
  (`docker compose.yml`), aucun rebuild n'est necessaire — verifiez que
  vous etes bien sur http://localhost:3000 (et pas 8080, qui correspond au
  mode production) et que le conteneur `frontend` tourne
  (`docker compose logs -f frontend` doit montrer Vite pret). Si vous avez
  lance le mode production (`docker-compose.prod.yml`), il faut relancer
  `--build` a chaque changement puisque le frontend y est compile en dur.

## Confidentialite

Les documents, embeddings et conversations sont stockes dans le volume
Docker `app_data`, sur des serveurs situes en France (OVHcloud). La
recherche web est auto-hebergee (SearXNG, sans tracking) et la
transcription audio s'execute sur le serveur, sans appel externe.

Le contenu des documents et des questions n'est transmis qu'a **Mistral
AI** (societe francaise, traitements dans l'Union europeenne) pour generer
les reponses, et n'est jamais utilise pour entrainer un modele. La
connexion SSO (Google) et le paiement (Stripe) sont les seuls autres
appels a des services tiers, uniquement pour ce qui les concerne
directement (identite, facturation) - jamais pour le contenu des documents
ou des conversations.
Voir la page "Confidentialite" de l'application pour le detail RGPD
(export et suppression de compte, desabonnement newsletter).
