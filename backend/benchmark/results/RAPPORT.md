# Benchmark Docverse : avant / après

Runs « avant » : avant_1, avant_2 · runs « après » : apres_1, apres_2


## Qualité

| Indicateur | Avant | Après | Écart |
|---|---|---|---|
| Note moyenne du juge (/10) | 8.7 | 8.8 | ✅ +1 % |
| Réponses exactes (%) | 88.35 | 83.3 | ⚠️ -6 % |
| Réponses avec invention (%) | 3.3 | 3.35 | ⚠️ +2 % |
| Note chatbot d'aide (/10) | 8 | 7.83 | ⚠️ -2 % |
| Bon document retrouvé (%) | 100 | 100 | = 0 % |
| Réponses avec citations (%) | 97.9 | 97.9 | = 0 % |
| Décision recherche web juste (%) | 80 | 75 | ⚠️ -6 % |
| Scans : mots retrouvés (%) | 100 | 100 | = 0 % |
| Scans : nombres retrouvés (%) | 92.5 | 96.25 | ✅ +4 % |

## Coût

| Indicateur | Avant | Après | Écart |
|---|---|---|---|
| Coût par question (USD) | 0.00223 | 0.00158 | ✅ -29 % |
| Coût pour 1 000 questions (USD) | 2.23 | 1.58 | ✅ -29 % |
| Appels IA par question | 4 | 3 | ✅ -25 % |
| Tokens envoyés par question | 4056.5 | 4013.5 | ✅ -1 % |
| Tokens reçus par question | 147 | 157.5 | ⚠️ +7 % |
| Coût par page scannée (USD) | 0.00245 | 0.00026 | ✅ -89 % |
| Coût par message d'aide (USD) | 0.00044 | 0.00009 | ✅ -80 % |

## Performance

| Indicateur | Avant | Après | Écart |
|---|---|---|---|
| Temps de réponse médian (s) | 4.38 | 3.51 | ✅ -20 % |
| Temps de réponse lent, p90 (s) | 8.64 | 6.43 | ✅ -26 % |
| Premier mot affiché, médian (s) | 2.93 | 2.05 | ✅ -30 % |
| CPU serveur par question (ms) | 120 | 118 | ✅ -2 % |
| Indexation d'un scan (s/page) | 2.25 | 3.67 | ⚠️ +63 % |
| Mémoire max du backend (Mo) | 268.4 | 237.3 | ✅ -12 % |

## Charge

| Indicateur | Avant | Après | Écart |
|---|---|---|---|
| 8 questions simultanées : durée totale (s) | 18.68 | 14.68 | ✅ -21 % |
| 8 questions simultanées : la plus lente (s) | 18.61 | 14.61 | ✅ -21 % |
| 8 questions simultanées : réponses en erreur | 8 | 0 | ✅ -100 % |

## Fiabilité

| Indicateur | Avant | Après | Écart |
|---|---|---|---|
| Questions en erreur (sur 30) | 0 | 0 | - |
| Refus « trop de requêtes » de Mistral | 11 | 0 | ✅ -100 % |
| Écart tokens affichés / réels (%) | - | 0 | - |

## Note par catégorie

| Catégorie | Avant | Après |
|---|---|---|
| absent | 9.25 | 10 |
| distracteur | 8.5 | 9.62 |
| factuel | 9.5 | 9.17 |
| historique | 9 | 8.5 |
| multi | 10 | 10 |
| scanne | 9.5 | 9.5 |
| web | 4.75 | 5.12 |

## Projection mensuelle (clé de la plateforme)

Hypothèse : chaque utilisateur actif pose 10 questions et indexe 5 pages scannées par jour.

| Utilisateurs actifs | Avant (USD/mois) | Après (USD/mois) |
|---|---|---|
| 10 | 10.36 | 5.13 |
| 100 | 103.65 | 51.30 |
| 1000 | 1036.50 | 513.00 |

## Duels (même question, juge à l'aveugle)

| Duel | Victoires A | Égalités | Victoires B |
|---|---|---|---|
| avant_1 vs avant_2 | 17 | 11 | 8 |
| avant_1 vs apres_1 | 15 | 11 | 10 |
| avant_2 vs apres_2 | 14 | 10 | 12 |
| avant_1 vs apres_small | 25 | 3 | 8 |

## Analyse (10/11/2026)

- **Qualité** : note du juge identique (8,7 → 8,8). Les duels avant/après (15-11-10 et 14-10-12)
  restent dans le bruit mesuré entre deux runs de la même version (17-11-8). Pas de perte détectable.
- **Fiabilité** : avant, 8 questions simultanées = 8 erreurs (quota Mistral Large : 15 requêtes/min
  sur ce compte, et 3 appels Large par question). Après : 1 appel Large par question + repli sur
  Small en cas de 429 → 0 erreur.
- **Scans** (`scan_*.json`) : OCR dédié ≈ 0,004 $/page (plus cher que l'existant), Medium ≈ 0,0025 $,
  Ministral 8B ≈ 0,0003 $ avec 100 % des mots et nombres retrouvés → retenu par défaut. Corpus de
  scans propres : à surveiller sur des photos de documents réelles (repli automatique sur Medium).
- **Réponses en Small** (`apres_small`) : nettement moins bonnes (duel 25-3-8 pour Large) → on garde
  Large pour la réponse finale.
- **Historique** : sans effet sur les tokens dans ce jeu (conversations courtes) ; l'économie
  apparaît sur les longues conversations. H02 (rappel de la 1re question) reste juste.
- **Point faible inchangé** : la décision « recherche web » se trompe dans ~25 % des cas (surtout des
  recherches inutiles), avant comme après. Piste suivante : préciser la consigne.
- **Chatbot d'aide en Small** : 1 réponse hors périmètre sur 12 (recette donnée après redirection) ;
  0 fuite sur 16 essais ciblés ensuite.
