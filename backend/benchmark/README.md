# Benchmark IA de Docverse (local uniquement)

Mesure, sur le même jeu de test, la **qualité**, le **coût**, la **vitesse** et la
**tenue en charge** de deux versions du code, pour décider d'une optimisation
sans risquer la production.

Rien ne touche la prod : l'application tourne en mémoire, avec une base et un
index vectoriel temporaires. Seuls les appels à Mistral sont réels, sur la clé du
`.env` local (quelques centimes par run).

## Ce qui est mesuré

| Étape | Mesures |
|---|---|
| Indexation de 5 documents (texte, Word, PDF, PDF scanné, image) | coût, durée, qualité de lecture des scans (mots et nombres retrouvés) |
| 30 questions (faits, pièges 2024/2025, multi-documents, scans, info absente, web, historique) | note d'un juge IA, réponse exacte, invention, bon document cité, décision web, coût, tokens, temps de réponse |
| 6 messages au chatbot d'aide | note du juge, coût |
| 8 questions envoyées en même temps | durée totale, réponse la plus lente, erreurs |

Le juge est Mistral Medium, à température 0. Le **duel** compare deux réponses à la
même question sans savoir laquelle vient de quelle version. Un duel entre deux runs
de la **même** version donne le bruit naturel : un écart avant/après plus petit
que ce bruit n'est pas une vraie perte de qualité.

## Lancer

```bash
cd backend
# 1. Version actuelle (à faire depuis une copie du commit de référence,
#    par exemple : git worktree add ../docverse-ref <commit>)
python benchmark/run.py --label avant_1
python benchmark/run.py --label avant_2
# 2. Nouvelle version
python benchmark/run.py --label apres_1
python benchmark/run.py --label apres_2
# 3. Notes du juge et duels
python benchmark/judge.py score avant_1 avant_2 apres_1 apres_2
python benchmark/judge.py duel avant_1 avant_2     # bruit
python benchmark/judge.py duel avant_1 apres_1
python benchmark/judge.py duel avant_2 apres_2
# 4. Rapport
python benchmark/compare.py --avant avant_1 avant_2 --apres apres_1 apres_2 \
  --duels avant_1__avant_2 avant_1__apres_1 avant_2__apres_2
```

Résultat : `benchmark/results/RAPPORT.md` (et `kpi.json`).

Options utiles de `run.py` :
- `--env CLE=VALEUR` teste un réglage sans toucher au code, par exemple
  `--env MISTRAL_CHAT_MODEL=mistral-small-latest` ;
- `--llm-concurrency` vaut 2 par défaut, comme la prod ;
- `--pause` (13 s) espace les questions pour que la phase qualité ne mesure pas
  les refus 429 de Mistral. C'est le test de charge qui mesure ces refus.
