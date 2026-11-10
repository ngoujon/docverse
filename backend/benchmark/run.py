"""Benchmark de bout en bout de Docverse, à lancer en local uniquement.

Il démarre l'application FastAPI en mémoire (aucun serveur, aucune donnée
réelle : base et index vectoriel dans un dossier temporaire), puis passe
par les vraies routes HTTP, exactement comme le navigateur :

1. ingestion des 5 documents du corpus (coût, durée, qualité OCR) ;
2. questions du jeu de test, une conversation par question ;
3. chatbot d'aide public ;
4. test de charge : N questions envoyées en même temps.

Seule la recherche web (SearXNG) est simulée, pour que les résultats ne
dépendent pas d'internet ; on enregistre seulement si elle a été
déclenchée. Les appels Mistral, eux, sont réels et facturés (quelques
centimes par run).

Usage :  python benchmark/run.py --label avant
Résultat : benchmark/results/<label>.json"""

import argparse
import asyncio
import json
import os
import re
import resource
import sys
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
REPO = BACKEND.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(HERE))


def _load_env_file(path: Path) -> None:
    """Lit uniquement les variables Mistral / LLM du .env local (sans
    jamais les afficher)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^(MISTRAL_[A-Z_]+|LLM_[A-Z_]+)=(.*)$", line.strip())
        if m and m.group(1) not in os.environ:
            os.environ[m.group(1)] = m.group(2).strip().strip('"').strip("'")


def _prepare_env(args) -> None:
    _load_env_file(REPO / ".env")
    os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="docverse_bench_")
    os.environ["SECRET_KEY"] = "benchmark-only-secret-key-0123456789-abcdefghijkl"
    os.environ["CAPTCHA_DIFFICULTY"] = "0"
    os.environ["FREE_MESSAGES_PER_DAY"] = "100000"
    os.environ["FREE_MAX_SPACES"] = "100"
    # Valeur de la prod (tools/production.env) : c'est elle qui crée la
    # file d'attente quand plusieurs utilisateurs posent une question.
    os.environ["LLM_MAX_CONCURRENCY"] = str(args.llm_concurrency)
    for item in args.env:
        key, _, value = item.partition("=")
        os.environ[key] = value


def _normalize_words(text: str) -> list[str]:
    text = text.lower().replace(" ", " ")
    text = re.sub(r"[*#|_`>\-]+", " ", text)
    return re.findall(r"[\wàâäéèêëîïôöùûüç°%€/.,:']+", text)


def _ocr_scores(ground_truth: str, extracted: str) -> dict:
    """Rappel des mots et des nombres de la vérité terrain retrouvés dans
    le texte extrait - insensible à la mise en forme (Markdown, tableaux)."""
    gt_words = _normalize_words(ground_truth)
    ex_words = _normalize_words(extracted)
    pool: dict[str, int] = {}
    for w in ex_words:
        pool[w.strip(".,:")] = pool.get(w.strip(".,:"), 0) + 1
    hit = 0
    for w in gt_words:
        key = w.strip(".,:")
        if pool.get(key, 0) > 0:
            pool[key] -= 1
            hit += 1
    gt_numbers = re.findall(r"\d[\d ,./]*\d|\d", ground_truth)
    compact = re.sub(r"\s+", "", extracted)
    num_hit = sum(1 for n in gt_numbers if re.sub(r"\s+", "", n) in compact)
    return {
        "word_recall": round(hit / max(len(gt_words), 1), 4),
        "number_recall": round(num_hit / max(len(gt_numbers), 1), 4),
        "extracted_chars": len(extracted),
    }


def _parse_sse(body: str) -> tuple[str, list, dict]:
    answer, sources, usage = "", [], {}
    for line in body.splitlines():
        if not line.startswith("data:"):
            continue
        try:
            event = json.loads(line[5:].strip())
        except ValueError:
            continue
        if event.get("type") == "token":
            answer += event.get("content", "")
        elif event.get("type") == "done":
            sources = event.get("sources") or []
            usage = event.get("usage") or {}
    return answer, sources, usage


def _rss_mb() -> float:
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # octets sous macOS, kilo-octets sous Linux
    return round(peak / (1024 * 1024) if sys.platform == "darwin" else peak / 1024, 1)


async def main(args) -> None:
    _prepare_env(args)
    t_origin = time.perf_counter()

    import httpx
    import recorder

    recorder.install()

    import corpus
    import dataset
    from app.database import SessionLocal
    from app.main import app
    from app import models
    from app.services import document_processor, rate_limiter, websearch

    # Limites anti-abus relevées : le benchmark envoie beaucoup de
    # requêtes depuis la même « IP ».
    for name in dir(rate_limiter):
        obj = getattr(rate_limiter, name)
        if isinstance(obj, rate_limiter.RateLimiter):
            obj.max_requests = 10**9

    web_triggered: dict[str, bool] = {}

    async def fake_search_web(query: str, max_results: int = 5) -> list[dict]:
        web_triggered[recorder.TAG.get()] = True
        return [{
            "title": "Résultat web simulé",
            "url": "https://exemple.test/resultat",
            "content": f"Résultat de recherche simulé pour « {query} » : donnée indisponible dans le benchmark.",
        }]

    websearch.search_web = fake_search_web

    extracted: dict[str, str] = {}
    original_process = document_processor.process_document

    async def capture_process(doc_type, file_path=None, url=None):
        title, text = await original_process(doc_type, file_path=file_path, url=url)
        extracted[recorder.TAG.get()] = text
        return title, text

    document_processor.process_document = capture_process

    results: dict = {
        "label": args.label,
        "date": datetime.now().isoformat(timespec="seconds"),
        "git": os.popen(f"git -C {REPO} rev-parse --short HEAD").read().strip(),
        "settings": {
            k: os.environ.get(k, "") for k in sorted(os.environ)
            if (k.startswith("MISTRAL_") and k != "MISTRAL_API_KEY") or k.startswith("LLM_")
            or k in ("CHAT_HISTORY_LIMIT", "RETRIEVAL_TOP_K", "RERANK_CANDIDATE_POOL")
        },
    }

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://bench", timeout=600) as client:
        challenge = (await client.get("/api/captcha/challenge")).json()
        reg = await client.post("/api/auth/register", json={
            "email": "bench@docverse-benchmark.fr", "password": "Bench-mark-2026!x", "display_name": "Bench",
            "captcha_salt": challenge["salt"], "captcha_nonce": 0, "terms_accepted": True,
        })
        reg.raise_for_status()
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        space = (await client.post("/api/spaces", json={"name": "Atelier Lumen"}, headers=headers)).json()
        space_id = space["id"]

        # ---------------------------------------------------------- 1. ingestion
        corpus_dir = Path(os.environ["DATA_DIR"]) / "corpus"
        docs = corpus.build(corpus_dir)
        ingest = []
        for d in docs:
            tag = f"ingest:{d['file']}"
            recorder.TAG.set(tag)
            t0, c0 = time.perf_counter(), time.process_time()
            with open(corpus_dir / d["file"], "rb") as fh:
                r = await client.post(
                    f"/api/spaces/{space_id}/documents/upload",
                    files={"file": (d["file"], fh.read())},
                    headers=headers,
                )
            doc_id = r.json().get("id")
            status, error = "?", None
            for _ in range(600):
                listing = (await client.get(f"/api/spaces/{space_id}/documents", headers=headers)).json()
                row = next((x for x in listing if x["id"] == doc_id), None)
                status = row["status"] if row else "absent"
                error = row.get("error_message") if row else None
                if status in ("ready", "error", "absent"):
                    break
                await asyncio.sleep(0.2)
            entry = {
                "file": d["file"], "kind": d["kind"], "status": status, "error": error,
                "wall_s": round(time.perf_counter() - t0, 2),
                "cpu_s": round(time.process_time() - c0, 2),
                "chunks": row.get("chunk_count") if row else 0,
                "usage": recorder.summarize(recorder.calls_for(tag)),
            }
            if d.get("ground_truth"):
                entry["pages"] = d["pages"]
                entry["ocr"] = _ocr_scores(d["ground_truth"], extracted.get(tag, ""))
                entry["extracted_text"] = extracted.get(tag, "")
            ingest.append(entry)
            print(f"  ingestion {d['file']:<28} {status:<6} {entry['wall_s']:>6}s  "
                  f"{entry['usage']['cost']*100:.3f} c$", flush=True)
        results["ingest"] = ingest
        if args.only_ingest:
            out = HERE / "results" / f"{args.label}.json"
            out.parent.mkdir(exist_ok=True)
            out.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"Résultats : {out}")
            return

        # ---------------------------------------------------------- 2. questions
        async def ask(item: dict, tag: str, history: list | None = None) -> dict:
            conv = (await client.post(f"/api/spaces/{space_id}/conversations",
                                      json={"title": item["id"]}, headers=headers)).json()
            if history:
                db = SessionLocal()
                try:
                    base = datetime.utcnow() - timedelta(hours=1)
                    n = 0
                    for user_text, assistant_text in history:
                        for role, content in (("user", user_text), ("assistant", assistant_text)):
                            db.add(models.Message(conversation_id=conv["id"], role=role, content=content,
                                                  created_at=base + timedelta(seconds=n)))
                            n += 1
                    db.commit()
                finally:
                    db.close()
            recorder.TAG.set(tag)
            t0, c0 = time.perf_counter(), time.process_time()
            r = await client.post(f"/api/conversations/{conv['id']}/chat",
                                  json={"message": item["q"]}, headers=headers)
            wall = time.perf_counter() - t0
            answer, sources, usage_evt = _parse_sse(r.text)
            calls = recorder.calls_for(tag)
            streams = [c for c in calls if c["endpoint"] == "chat" and c.get("stream")]
            ttft = (streams[-1].get("first_byte", t0) - t0) if streams else wall
            labels = [s.get("label") for s in sources if s.get("type") == "document"]
            return {
                "id": item["id"], "cat": item["cat"], "q": item["q"], "ref": item["ref"],
                "answer": answer, "status": r.status_code,
                "sources": labels,
                "doc_hit": (item.get("expect_doc") in labels) if item.get("expect_doc") else None,
                "expect_web": item.get("expect_web", False),
                "web_triggered": web_triggered.get(tag, False),
                "has_citation": bool(re.search(r"\[\d+\]", answer)),
                "wall_s": round(wall, 2), "ttft_s": round(ttft, 2),
                "cpu_s": round(time.process_time() - c0, 3),
                "usage": recorder.summarize(calls),
                "reported_usage": usage_evt,
            }

        # Pause entre deux questions : la phase « qualité » doit mesurer les
        # réponses, pas les refus 429 du quota par minute de Mistral (c'est
        # le test de charge, plus bas, qui mesure la tenue sous la rafale).
        answers = []
        for item in dataset.QUESTIONS:
            await asyncio.sleep(args.pause)
            res = await ask(item, f"q:{item['id']}")
            answers.append(res)
            print(f"  question {item['id']}  {res['wall_s']:>5}s  {res['usage']['calls']} appels  "
                  f"{res['usage']['cost']*100:.3f} c$", flush=True)
        for conv in dataset.CONVERSATIONS:
            await asyncio.sleep(args.pause)
            res = await ask(conv, f"q:{conv['id']}", history=conv["history"])
            res["history_turns"] = len(conv["history"])
            answers.append(res)
            print(f"  question {conv['id']}  {res['wall_s']:>5}s  {res['usage']['calls']} appels  "
                  f"{res['usage']['cost']*100:.3f} c$", flush=True)
        results["answers"] = answers

        # ---------------------------------------------------------- 3. support
        support = []
        for item in dataset.SUPPORT_QUESTIONS:
            tag = f"support:{item['id']}"
            await asyncio.sleep(args.pause / 2)
            recorder.TAG.set(tag)
            t0 = time.perf_counter()
            r = await client.post("/api/support/chat", json={"message": item["q"], "history": []})
            answer, _, _ = _parse_sse(r.text)
            support.append({
                "id": item["id"], "cat": "support", "q": item["q"], "ref": item["ref"], "answer": answer,
                "wall_s": round(time.perf_counter() - t0, 2),
                "usage": recorder.summarize(recorder.calls_for(tag)),
            })
        results["support"] = support
        print("  support OK", flush=True)

        # ---------------------------------------------------------- 4. charge
        load_items = [q for q in dataset.QUESTIONS if q["cat"] in ("factuel", "distracteur")][: args.load_users]
        # Fenêtre de quota remise à zéro avant la rafale : les deux versions
        # partent ainsi du même état.
        await asyncio.sleep(65)
        t0 = time.perf_counter()
        c0 = time.process_time()
        load = await asyncio.gather(*[ask(item, f"load:{i}:{item['id']}") for i, item in enumerate(load_items)])
        total = time.perf_counter() - t0
        lat = sorted(x["wall_s"] for x in load)
        ttfts = sorted(x["ttft_s"] for x in load)
        results["load"] = {
            "users": len(load_items),
            "llm_concurrency": args.llm_concurrency,
            "total_s": round(total, 2),
            "cpu_s": round(time.process_time() - c0, 2),
            "latency_p50_s": lat[len(lat) // 2],
            "latency_max_s": lat[-1],
            "ttft_p50_s": ttfts[len(ttfts) // 2],
            "ttft_max_s": ttfts[-1],
            "errors": sum(1 for x in load if x["status"] != 200 or "erreur est survenue" in x["answer"]),
            "throughput_q_per_min": round(len(load_items) / total * 60, 1),
        }
        print(f"  charge {len(load_items)} utilisateurs : {total:.1f}s", flush=True)

    results["process"] = {"peak_rss_mb": _rss_mb(), "cpu_total_s": round(time.process_time(), 1)}
    results["totals"] = {
        "ingest": recorder.summarize(recorder.calls_for("ingest:")),
        "questions": recorder.summarize(recorder.calls_for("q:")),
        "support": recorder.summarize(recorder.calls_for("support:")),
        "load": recorder.summarize(recorder.calls_for("load:")),
        "http_errors": sum(1 for c in recorder.CALLS if c.get("status", 200) >= 400),
        "http_429": sum(1 for c in recorder.CALLS if c.get("status") == 429),
    }
    results["calls"] = [
        {k: (round(v - t_origin, 3) if k in ("started", "first_byte", "ended") else v) for k, v in c.items()}
        for c in recorder.CALLS
    ]
    out_dir = HERE / "results"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"{args.label}.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Résultats : {out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    parser.add_argument("--llm-concurrency", type=int, default=2)
    parser.add_argument("--load-users", type=int, default=8)
    parser.add_argument("--pause", type=float, default=13.0, help="secondes entre deux questions")
    parser.add_argument("--only-ingest", action="store_true", help="mesurer seulement l'indexation")
    parser.add_argument("--env", action="append", default=[], help="KEY=VALUE supplémentaire")
    asyncio.run(main(parser.parse_args()))
