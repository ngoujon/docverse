# Open RAG

Application web auto-hebergee (Docker) pour discuter avec une IA locale
(Ollama) a propos de vos propres documents : PDF, images (scans, photos),
pages web, DOCX, TXT/Markdown. L'IA peut aussi completer ses reponses avec
une recherche web via un moteur local (SearXNG), sans dependre d'aucune API
externe payante.

## Fonctionnalites

- **Espaces de travail** cloisonnes : chaque espace a ses propres documents
  et ses propres conversations. Aucune donnee n'est partagee entre espaces.
  Une conversation appartient toujours a un seul espace.
- **Plusieurs conversations par espace**, avec historique persistant.
- **Ingestion multi-format** : PDF (texte natif + OCR automatique par IA de
  vision pour les PDF scannes), images (JPG/PNG/WEBP...), pages web
  (extraction du contenu principal), DOCX, TXT, Markdown.
- **Lecture d'images par IA** : les documents images ou les pages de PDF
  scannees sont transcrits/decrits par un modele multimodal Ollama (par
  defaut `llava`), puis indexes comme du texte normal.
- **RAG (Retrieval-Augmented Generation)** : chaque question est enrichie
  avec les passages les plus pertinents des documents de l'espace
  (recherche vectorielle via ChromaDB + embeddings Ollama), et citee dans
  la reponse (`[1]`, `[2]`, ...).
- **Recherche web optionnelle** (bouton par conversation) : complete le
  contexte avec des resultats d'un moteur de recherche local (SearXNG),
  sans tracking et sans cle API.
- **Interface sombre, ergonomique**, avec zones de glisser-deposer pour
  l'ajout de documents, statut de traitement en temps reel, reponses en
  streaming (mot a mot).
- **100% local** : aucun appel a une API cloud, tout tourne dans vos
  conteneurs Docker.

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

- **Interface web** : http://localhost:3000
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

Sur une machine avec peu de RAM/VRAM (< 8 Go), privilegiez des modeles
`:7b` ou plus petits. Vous pouvez changer de modele a tout moment sans
perdre vos documents deja indexes (seule la generation des reponses et la
lecture d'images utilisent le modele configure au moment de l'appel).

## Utilisation

1. Creez un **espace de travail** (bouton `+` dans la colonne de gauche) :
   nom, description, couleur.
2. Dans le panneau **Documents** (a droite), glissez-deposez vos fichiers
   ou collez un lien web. Le statut passe de *en attente* → *analyse en
   cours* → *pret* (ou *erreur* avec le detail au survol).
3. Creez une **conversation** dans cet espace et posez vos questions. Les
   reponses citent les extraits de documents utilises.
4. Activez **Recherche web** en haut de la conversation pour completer les
   reponses avec des sources en ligne (recherchees via SearXNG, en local).
5. Creez d'autres espaces pour des sujets differents : leurs documents et
   conversations restent totalement isoles les uns des autres.

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

Toutes les donnees (documents, embeddings, conversations) restent dans les
volumes Docker locaux (`app_data`, `ollama_data`). Aucune information
n'est envoyee a un service tiers, y compris pour la recherche web (SearXNG
est auto-heberge).
