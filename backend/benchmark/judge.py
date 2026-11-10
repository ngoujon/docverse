"""Juge qualité : note les réponses d'un run, et compare deux runs.

Le juge est Mistral Medium 3.5 (le modèle le plus capable du compte, et
un autre modèle que ceux évalués), à température 0 :
- note absolue : chaque réponse est notée sur 10 par rapport à la réponse
  de référence, avec deux drapeaux (réponse exacte ? invention ?) ;
- duel : pour une même question, la réponse A et la réponse B sont
  présentées dans un ordre tiré au hasard (graine fixe) et le juge désigne
  la meilleure ou déclare l'égalité. Comparer deux runs de la MÊME version
  donne le « bruit » naturel : un écart avant/après plus petit que ce
  bruit n'est pas une perte de qualité.

Usage :
  python benchmark/judge.py score avant_1
  python benchmark/judge.py duel avant_1 apres_1"""

import asyncio
import json
import os
import random
import re
import sys
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
JUDGE_MODEL = os.environ.get("JUDGE_MODEL", "mistral-medium-latest")

_SCORE_PROMPT = """Tu es un évaluateur exigeant d'assistants IA documentaires.

Question posée : {q}
Réponse de référence (ce qu'une bonne réponse doit contenir) : {ref}

Réponse à évaluer :
<<<
{answer}
>>>

Évalue la réponse. Réponds UNIQUEMENT en JSON :
{{"score": <entier 0-10>, "exact": <true si l'information clé de la référence est présente et juste>,
"hallucination": <true si la réponse affirme un fait faux ou inventé>, "commentaire": "<une phrase>"}}

Barème : 10 = parfait (juste, complet, clair) ; 7 = juste mais incomplet ou verbeux ;
4 = partiellement faux ; 0 = faux, hors sujet ou erreur technique."""

_DUEL_PROMPT = """Tu compares deux réponses d'assistant IA à la même question.

Question : {q}
Réponse de référence : {ref}

Réponse A :
<<<
{a}
>>>

Réponse B :
<<<
{b}
>>>

Laquelle est la meilleure pour l'utilisateur (exactitude d'abord, puis complétude,
puis clarté) ? Si la différence est négligeable, réponds "egal".
Réponds UNIQUEMENT en JSON : {{"gagnant": "A" | "B" | "egal", "raison": "<une phrase>"}}"""


def _api_key() -> str:
    key = os.environ.get("MISTRAL_API_KEY", "")
    if key:
        return key
    env = HERE.parent.parent / ".env"
    for line in env.read_text(encoding="utf-8").splitlines():
        if line.startswith("MISTRAL_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("MISTRAL_API_KEY introuvable")


async def _ask_json(client: httpx.AsyncClient, prompt: str, sem: asyncio.Semaphore) -> dict:
    async with sem:
        for attempt in range(6):
            r = await client.post(
                "https://api.mistral.ai/v1/chat/completions",
                json={
                    "model": JUDGE_MODEL,
                    "temperature": 0,
                    "response_format": {"type": "json_object"},
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            if r.status_code == 429 or r.status_code >= 500:
                await asyncio.sleep(2 * (attempt + 1))
                continue
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
            match = re.search(r"\{.*\}", content, re.S)
            return json.loads(match.group(0) if match else content)
    raise RuntimeError("Juge indisponible")


def _items(run: dict) -> list[dict]:
    return run["answers"] + run["support"]


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=120,
        headers={"Authorization": f"Bearer {_api_key()}"},
        transport=httpx.AsyncHTTPTransport(),
    )


async def score(label: str) -> None:
    path = RESULTS / f"{label}.json"
    run = json.loads(path.read_text(encoding="utf-8"))
    sem = asyncio.Semaphore(4)
    async with _client() as client:
        items = _items(run)
        verdicts = await asyncio.gather(*[
            _ask_json(client, _SCORE_PROMPT.format(q=it["q"], ref=it["ref"], answer=it["answer"] or "(vide)"), sem)
            for it in items
        ])
    for it, v in zip(items, verdicts, strict=True):
        it["judge"] = v
    path.write_text(json.dumps(run, ensure_ascii=False, indent=1), encoding="utf-8")
    mean = sum(v.get("score", 0) for v in verdicts) / len(verdicts)
    print(f"{label} : note moyenne {mean:.2f}/10 sur {len(verdicts)} réponses")


async def duel(label_a: str, label_b: str) -> None:
    run_a = json.loads((RESULTS / f"{label_a}.json").read_text(encoding="utf-8"))
    run_b = json.loads((RESULTS / f"{label_b}.json").read_text(encoding="utf-8"))
    by_id_b = {it["id"]: it for it in _items(run_b)}
    rng = random.Random(42)
    sem = asyncio.Semaphore(4)
    pairs, prompts = [], []
    for it in _items(run_a):
        other = by_id_b.get(it["id"])
        if not other:
            continue
        swap = rng.random() < 0.5
        first, second = (other, it) if swap else (it, other)
        prompts.append(_DUEL_PROMPT.format(q=it["q"], ref=it["ref"], a=first["answer"], b=second["answer"]))
        pairs.append((it["id"], it["cat"], swap))
    async with _client() as client:
        verdicts = await asyncio.gather(*[_ask_json(client, p, sem) for p in prompts])
    rows = []
    tally = {label_a: 0, label_b: 0, "egal": 0}
    for (qid, cat, swap), v in zip(pairs, verdicts, strict=True):
        g = str(v.get("gagnant", "egal")).strip().upper()
        if g == "A":
            winner = label_b if swap else label_a
        elif g == "B":
            winner = label_a if swap else label_b
        else:
            winner = "egal"
        tally[winner] += 1
        rows.append({"id": qid, "cat": cat, "gagnant": winner, "raison": v.get("raison", "")})
    out = RESULTS / f"duel_{label_a}__{label_b}.json"
    out.write_text(json.dumps({"a": label_a, "b": label_b, "tally": tally, "rows": rows},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Duel {label_a} vs {label_b} : {tally}")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "score":
        for label in sys.argv[2:]:
            asyncio.run(score(label))
    elif cmd == "duel":
        asyncio.run(duel(sys.argv[2], sys.argv[3]))
    else:
        raise SystemExit(__doc__)
