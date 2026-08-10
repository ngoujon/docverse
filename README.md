# Open RAG

Application web auto-hebergee (Docker) pour discuter avec une IA locale
(Ollama) a propos de vos propres documents : PDF, images (scans, photos),
fichiers audio (transcrits automatiquement), pages web, DOCX, TXT/Markdown.
L'IA peut aussi completer ses reponses avec une recherche web via un
moteur local (SearXNG). Le moteur d'IA reste 100% local (Ollama, dans vos
propres conteneurs Docker) par defaut, avec une bascule optionnelle vers
Ollama Cloud pour des reponses plus rapides.

A l'origine un outil local et gratuit, Open RAG est desormais pense comme
un produit avec des comptes utilisateur et une tarification par palier
(voir `TODO.md` et le plan d'affaires pour le detail) : chaque personne a
un compte, chaque espace de travail appartient a un palier d'abonnement
qui determine ses limites (nombre d'espaces, membres par espace, stockage).

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
  chaque palier limite le nombre d'espaces de travail possedes et le
  nombre de membres par espace (voir `PLAN_QUOTAS` dans
  `backend/app/config.py`). L'integration de paiement (Stripe) est en
  cours de mise en place.
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
  scannees sont transcrits/decrits par un modele multimodal Ollama (par
  defaut `llava`), puis indexes comme du texte normal.
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
  (recherche vectorielle via ChromaDB + embeddings Ollama), et citee dans
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
- **File d'attente pour les requetes IA** : toutes les requetes a Ollama
  (chat, embeddings, vision) sont traitees une par une par defaut, pour
  rester stable meme sur un petit serveur avec plusieurs utilisateurs en
  meme temps (voir `OLLAMA_MAX_CONCURRENCY`).
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
   ├── Ollama            → chat, vision (OCR/description d'images), embeddings
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
- Au moins ~10-15 Go d'espace disque libre pour les modeles Ollama
- Idealement un GPU (NVIDIA) pour des reponses rapides, mais fonctionne
  aussi sur CPU (plus lent)

## Demarrage (developpement, avec hot-reload)

```bash
cp .env.example .env
# Ajustez les modeles dans .env si besoin (voir "Choix des modeles" ci-dessous)

docker compose up -d --build
```

Au premier lancement, le service `ollama-pull` telecharge automatiquement
les modeles configures (`llama3.1:8b`, `llava:7b`, `nomic-embed-text` par
defaut). Cela peut prendre plusieurs minutes selon votre connexion. Vous
pouvez suivre la progression avec :

```bash
docker compose logs -f ollama-pull
```

Une fois le telechargement termine, l'application est disponible sur :

- **Page d'accueil** : http://localhost:3000
- **Application (espaces/chat)** : http://localhost:3000/app
- **API backend** (debug) : http://localhost:8000/api/health

Ce `docker compose up` initial (avec `--build`) est le seul rebuild
necessaire : ensuite, tant que vous ne touchez pas a `requirements.txt` ou
`package.json`, les modifications de code (frontend comme backend) sont
prises en compte automatiquement grace au montage de volume + hot-reload,
il suffit de recharger la page.

## Deploiement (production)

```bash
cp .env.example .env
docker compose -f docker-compose.prod.yml up -d --build
```

Interface disponible sur http://localhost:8080 (ou `FRONTEND_PORT`). Cette
variante compile le frontend une bonne fois pour toutes (image Nginx) : il
faut relancer `--build` a chaque changement de code.

## Choix des modeles

Modifiables dans `.env` avant le premier lancement (ou en relancant
`docker compose up -d` apres modification, un nouveau `ollama pull` sera
declenche si necessaire) :

| Variable              | Role                          | Suggestions                                    |
|------------------------|-------------------------------|-------------------------------------------------|
| `OLLAMA_CHAT_MODEL`   | Conversation / raisonnement    | `llama3.1:8b`, `qwen2.5:7b-instruct`, `qwen2.5:14b-instruct` |
| `OLLAMA_VISION_MODEL` | Lecture d'images / PDF scannes | `llava:7b`, `qwen2.5vl:7b`                      |
| `OLLAMA_EMBED_MODEL`  | Indexation vectorielle         | `nomic-embed-text`                              |
| `WHISPER_MODEL_SIZE`  | Transcription audio (self-hosted, pas via Ollama) | `small` (par defaut), `base` (plus rapide/moins precis), `medium` |

Sur une machine avec peu de RAM/VRAM (< 8 Go), privilegiez des modeles
`:7b` ou plus petits. Vous pouvez changer de modele a tout moment sans
perdre vos documents deja indexes (seule la generation des reponses et la
lecture d'images utilisent le modele configure au moment de l'appel). Le
modele Whisper est telecharge une seule fois (dans le volume `app_data`)
au premier fichier audio uploade, pas au demarrage.

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

Cette application est prevue pour tourner correctement meme sur un VPS
modeste (2 vCPU type Hostinger KVM 2) :

- **File d'attente Ollama** (`OLLAMA_MAX_CONCURRENCY`, defaut `1`) : toutes
  les requetes IA (chat, recherche, vision) passent par une file globale
  cote backend. Si plusieurs personnes utilisent l'app en meme temps, elles
  sont traitees les unes apres les autres au lieu de saturer le serveur ;
  l'utilisateur voit un indicateur "en file d'attente" pendant l'attente.
  N'augmentez cette valeur que si votre machine a vraiment la RAM/le GPU
  pour plusieurs inferences simultanees.
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
  (`docker-compose.prod.yml`) : Ollama (11434, sans authentification native)
  et l'API backend (8000, debug) sont lies a `127.0.0.1` par defaut - seul
  le frontend (Nginx) est cense etre expose sur Internet.
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
  -v open-rag_app_data:/data:ro \
  -v "$(pwd)/backups":/backup \
  alpine tar czf /backup/open-rag-data-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .

# Restauration (ecrase les donnees actuelles du volume - a faire conteneurs arretes)
docker compose down
docker run --rm \
  -v open-rag_app_data:/data \
  -v "$(pwd)/backups":/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/open-rag-data-XXXXXXXX-XXXXXX.tar.gz -C /data"
docker compose up -d
```

Adaptez `open-rag_app_data` au nom reel du volume (`docker volume ls`) si
le projet n'est pas dans un dossier nomme `open-rag`. Conservez ces
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
export OLLAMA_BASE_URL=http://localhost:11434
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

- **"Ollama injoignable"** (point rouge dans la colonne de gauche) :
  verifiez `docker compose logs ollama` et que le conteneur est demarre.
- **Documents bloques en "En attente"** : le service `ollama-pull` n'a
  peut-etre pas fini de telecharger les modeles — verifiez
  `docker compose logs ollama-pull`.
- **Reponses lentes / CPU a 100%** : normal sans GPU avec de gros modeles ;
  essayez un modele de chat plus petit (`qwen2.5:7b-instruct` par ex.).
- **Recherche web sans resultat** : verifiez `docker compose logs searxng`.
- **Deconnecte de facon inattendue** : le jeton de session est stocke dans
  le navigateur (localStorage) ; si vous changez de navigateur/appareil ou
  videz les donnees du site, vous devrez vous reconnecter. Idem si le
  backend a redemarre sans `SECRET_KEY` fixe dans `.env` (une cle
  temporaire est alors regeneree, invalidant toutes les sessions).
- **"En file d'attente" reste affiche longtemps** : normal si plusieurs
  personnes discutent en meme temps sur un serveur a `OLLAMA_MAX_CONCURRENCY=1`
  - les requetes sont traitees dans l'ordre d'arrivee.
- **`ollama-pull` reste affiche comme "Exited" dans `docker compose ps`** :
  c'est normal, ce n'est pas un serveur mais une tache ponctuelle (elle
  telecharge les modeles puis se termine avec succes). Verifiez juste
  qu'elle s'est bien terminee sans erreur : `docker compose logs ollama-pull`.
- **Mes changements de code n'apparaissent pas** : en mode developpement
  (`docker compose.yml`), aucun rebuild n'est necessaire — verifiez que
  vous etes bien sur http://localhost:3000 (et pas 8080, qui correspond au
  mode production) et que le conteneur `frontend` tourne
  (`docker compose logs -f frontend` doit montrer Vite pret). Si vous avez
  lance le mode production (`docker-compose.prod.yml`), il faut relancer
  `--build` a chaque changement puisque le frontend y est compile en dur.

## Confidentialite

Les documents, embeddings et conversations restent dans les volumes Docker
locaux (`app_data`, `ollama_data`) et la recherche web est auto-hebergee
(SearXNG, sans tracking). La connexion SSO (Google) et le paiement
(Stripe, en cours d'integration) sont les deux seuls appels a des services
tiers, et uniquement pour ce qui les concerne directement (identite,
facturation) - jamais pour le contenu des documents ou des conversations.
Voir la page "Confidentialite" de l'application pour le detail RGPD
(export et suppression de compte, desabonnement newsletter).
