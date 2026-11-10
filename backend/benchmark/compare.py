"""Calcule les KPI de chaque run et produit le rapport avant/après.

Usage :
  python benchmark/compare.py --avant avant_1 avant_2 --apres apres_1 apres_2
Écrit benchmark/results/kpi.json et benchmark/results/RAPPORT.md"""

import argparse
import json
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
DOC_CATS = ("factuel", "distracteur", "multi", "scanne", "historique")


def _pct(values) -> float:
    values = list(values)
    return round(100 * sum(1 for v in values if v) / len(values), 1) if values else 0.0


def _quantile(values, q) -> float:
    values = sorted(values)
    if not values:
        return 0.0
    idx = min(int(round(q * (len(values) - 1))), len(values) - 1)
    return round(values[idx], 2)


def _is_error(answer: str) -> bool:
    return "erreur est survenue" in (answer or "")


def kpis(run: dict) -> dict:
    answers = run["answers"]
    judged = [a for a in answers if a.get("judge")]
    support = run["support"]
    scanned = [d for d in run["ingest"] if d.get("ocr")]
    texts = [d for d in run["ingest"] if not d.get("ocr")]
    q_costs = [a["usage"]["cost"] for a in answers]
    out = {
        # --- qualité
        "note_moyenne": round(statistics.mean(a["judge"]["score"] for a in judged), 2) if judged else None,
        "reponses_exactes_pct": _pct(a["judge"].get("exact") for a in judged) if judged else None,
        "hallucinations_pct": _pct(a["judge"].get("hallucination") for a in judged) if judged else None,
        "note_par_categorie": {},
        "note_support": round(statistics.mean(s["judge"]["score"] for s in support if s.get("judge")), 2)
        if any(s.get("judge") for s in support) else None,
        "bon_document_retrouve_pct": _pct(a["doc_hit"] for a in answers if a.get("doc_hit") is not None),
        "citations_pct": _pct(a["has_citation"] for a in answers if a["cat"] in DOC_CATS),
        "declencheur_web_juste_pct": _pct(a["web_triggered"] == a["expect_web"] for a in answers),
        "web_faux_positifs": sum(1 for a in answers if a["web_triggered"] and not a["expect_web"]),
        "web_oublis": sum(1 for a in answers if a["expect_web"] and not a["web_triggered"]),
        "ocr_rappel_mots_pct": round(100 * statistics.mean(d["ocr"]["word_recall"] for d in scanned), 1),
        "ocr_rappel_nombres_pct": round(100 * statistics.mean(d["ocr"]["number_recall"] for d in scanned), 1),
        # --- coût
        "cout_par_question_usd": round(statistics.mean(q_costs), 5),
        "appels_ia_par_question": round(statistics.mean(a["usage"]["calls"] for a in answers), 2),
        "tokens_entree_par_question": round(statistics.mean(a["usage"]["prompt_tokens"] for a in answers)),
        "tokens_sortie_par_question": round(statistics.mean(a["usage"]["completion_tokens"] for a in answers)),
        "cout_par_page_scannee_usd": round(
            sum(d["usage"]["cost"] for d in scanned) / max(sum(d["pages"] for d in scanned), 1), 5),
        "cout_docs_texte_usd": round(sum(d["usage"]["cost"] for d in texts), 5),
        "cout_par_message_support_usd": round(statistics.mean(s["usage"]["cost"] for s in support), 5),
        # --- performance
        "latence_p50_s": _quantile([a["wall_s"] for a in answers], 0.5),
        "latence_p90_s": _quantile([a["wall_s"] for a in answers], 0.9),
        "premier_mot_p50_s": _quantile([a["ttft_s"] for a in answers], 0.5),
        "cpu_serveur_par_question_ms": round(1000 * statistics.mean(a["cpu_s"] for a in answers)),
        "ingestion_scan_s_par_page": round(sum(d["wall_s"] for d in scanned) / max(sum(d["pages"] for d in scanned), 1), 2),
        "memoire_pic_mo": run["process"]["peak_rss_mb"],
        "charge_utilisateurs": run["load"]["users"],
        "charge_duree_totale_s": run["load"]["total_s"],
        "charge_latence_p50_s": run["load"]["latency_p50_s"],
        "charge_latence_max_s": run["load"]["latency_max_s"],
        "charge_erreurs": run["load"]["errors"],
        # --- fiabilité
        "reponses_en_erreur": sum(1 for a in answers if _is_error(a["answer"])),
        "refus_429_mistral": run["totals"].get("http_429", 0),
    }
    for cat in sorted({a["cat"] for a in judged}):
        out["note_par_categorie"][cat] = round(
            statistics.mean(a["judge"]["score"] for a in judged if a["cat"] == cat), 2)
    out["cout_1000_questions_usd"] = round(out["cout_par_question_usd"] * 1000, 2)
    # Fiabilité du compteur affiché à l'utilisateur (nouvelle version
    # seulement) : tokens annoncés par l'app vs tokens relevés sur le réseau.
    shown = [(a["reported_usage"], a["usage"]) for a in answers if a.get("reported_usage")]
    if shown:
        reported = sum(r["prompt_tokens"] + r["completion_tokens"] for r, _ in shown)
        measured = sum(u["prompt_tokens"] + u["completion_tokens"] for _, u in shown)
        out["ecart_compteur_affiche_pct"] = round(100 * (reported - measured) / max(measured, 1), 1)
    else:
        out["ecart_compteur_affiche_pct"] = None
    return out


def _avg(dicts: list[dict]) -> dict:
    merged = {}
    for key in dicts[0]:
        vals = [d[key] for d in dicts if d.get(key) is not None]
        if not vals:
            merged[key] = None
        elif isinstance(vals[0], dict):
            merged[key] = {k: round(statistics.mean(v[k] for v in vals if k in v), 2) for k in vals[0]}
        else:
            merged[key] = round(statistics.mean(vals), 5 if isinstance(vals[0], float) and vals[0] < 1 else 2)
    return merged


LABELS = {
    "note_moyenne": ("Qualité", "Note moyenne du juge (/10)", "plus"),
    "reponses_exactes_pct": ("Qualité", "Réponses exactes (%)", "plus"),
    "hallucinations_pct": ("Qualité", "Réponses avec invention (%)", "moins"),
    "note_support": ("Qualité", "Note chatbot d'aide (/10)", "plus"),
    "bon_document_retrouve_pct": ("Qualité", "Bon document retrouvé (%)", "plus"),
    "citations_pct": ("Qualité", "Réponses avec citations (%)", "plus"),
    "declencheur_web_juste_pct": ("Qualité", "Décision recherche web juste (%)", "plus"),
    "ocr_rappel_mots_pct": ("Qualité", "Scans : mots retrouvés (%)", "plus"),
    "ocr_rappel_nombres_pct": ("Qualité", "Scans : nombres retrouvés (%)", "plus"),
    "cout_par_question_usd": ("Coût", "Coût par question (USD)", "moins"),
    "cout_1000_questions_usd": ("Coût", "Coût pour 1 000 questions (USD)", "moins"),
    "appels_ia_par_question": ("Coût", "Appels IA par question", "moins"),
    "tokens_entree_par_question": ("Coût", "Tokens envoyés par question", "moins"),
    "tokens_sortie_par_question": ("Coût", "Tokens reçus par question", "moins"),
    "cout_par_page_scannee_usd": ("Coût", "Coût par page scannée (USD)", "moins"),
    "cout_par_message_support_usd": ("Coût", "Coût par message d'aide (USD)", "moins"),
    "latence_p50_s": ("Performance", "Temps de réponse médian (s)", "moins"),
    "latence_p90_s": ("Performance", "Temps de réponse lent, p90 (s)", "moins"),
    "premier_mot_p50_s": ("Performance", "Premier mot affiché, médian (s)", "moins"),
    "cpu_serveur_par_question_ms": ("Performance", "CPU serveur par question (ms)", "moins"),
    "ingestion_scan_s_par_page": ("Performance", "Indexation d'un scan (s/page)", "moins"),
    "memoire_pic_mo": ("Performance", "Mémoire max du backend (Mo)", "moins"),
    "charge_duree_totale_s": ("Charge", "8 questions simultanées : durée totale (s)", "moins"),
    "charge_latence_max_s": ("Charge", "8 questions simultanées : la plus lente (s)", "moins"),
    "charge_erreurs": ("Charge", "8 questions simultanées : réponses en erreur", "moins"),
    "reponses_en_erreur": ("Fiabilité", "Questions en erreur (sur 30)", "moins"),
    "refus_429_mistral": ("Fiabilité", "Refus « trop de requêtes » de Mistral", "moins"),
    "ecart_compteur_affiche_pct": ("Fiabilité", "Écart tokens affichés / réels (%)", "moins"),
}


def _fmt(v) -> str:
    if v is None:
        return "-"
    if isinstance(v, float) and abs(v) < 0.1 and v != 0:
        return f"{v:.5f}"
    return f"{v:g}" if isinstance(v, (int, float)) else str(v)


def _delta(before, after, direction) -> str:
    if before in (None, 0) or after is None:
        return "-"
    change = (after - before) / abs(before) * 100
    better = change > 0 if direction == "plus" else change < 0
    sign = "+" if change > 0 else ""
    icon = "✅" if better and abs(change) >= 1 else ("⚠️" if not better and abs(change) >= 1 else "=")
    return f"{icon} {sign}{change:.0f} %"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--avant", nargs="+", required=True)
    p.add_argument("--apres", nargs="+", required=True)
    p.add_argument("--duels", nargs="*", default=[])
    args = p.parse_args()
    load = lambda label: json.loads((RESULTS / f"{label}.json").read_text(encoding="utf-8"))  # noqa: E731
    before = _avg([kpis(load(x)) for x in args.avant])
    after = _avg([kpis(load(x)) for x in args.apres])
    lines = ["# Benchmark Docverse : avant / après", "",
             f"Runs « avant » : {', '.join(args.avant)} · runs « après » : {', '.join(args.apres)}", ""]
    section = None
    for key, (sec, label, direction) in LABELS.items():
        if sec != section:
            lines += ["", f"## {sec}", "", "| Indicateur | Avant | Après | Écart |", "|---|---|---|---|"]
            section = sec
        lines.append(f"| {label} | {_fmt(before.get(key))} | {_fmt(after.get(key))} | "
                     f"{_delta(before.get(key), after.get(key), direction)} |")
    lines += ["", "## Note par catégorie", "", "| Catégorie | Avant | Après |", "|---|---|---|"]
    for cat in before.get("note_par_categorie") or {}:
        lines.append(f"| {cat} | {before['note_par_categorie'].get(cat)} | "
                     f"{(after.get('note_par_categorie') or {}).get(cat)} |")
    lines += ["", "## Projection mensuelle (clé de la plateforme)", "",
              "Hypothèse : chaque utilisateur actif pose 10 questions et indexe 5 pages scannées par jour.", "",
              "| Utilisateurs actifs | Avant (USD/mois) | Après (USD/mois) |", "|---|---|---|"]
    def monthly(k: dict, users: int) -> float:
        return users * 30 * (10 * k["cout_par_question_usd"] + 5 * k["cout_par_page_scannee_usd"])

    for users in (10, 100, 1000):
        lines.append(f"| {users} | {monthly(before, users):.2f} | {monthly(after, users):.2f} |")
    if args.duels:
        lines += ["", "## Duels (même question, juge à l'aveugle)", "", "| Duel | Victoires A | Égalités | Victoires B |",
                  "|---|---|---|---|"]
        for name in args.duels:
            d = json.loads((RESULTS / f"duel_{name}.json").read_text(encoding="utf-8"))
            t = d["tally"]
            lines.append(f"| {d['a']} vs {d['b']} | {t[d['a']]} | {t['egal']} | {t[d['b']]} |")
    (RESULTS / "RAPPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (RESULTS / "kpi.json").write_text(json.dumps({"avant": before, "apres": after}, ensure_ascii=False, indent=1),
                                      encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
