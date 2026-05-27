# -*- coding: utf-8 -*-
"""
evidence_memory.py <slug> <command> [options]

Builds a lightweight, queryable memory cache from evidence.json.
evidence.json remains the only source of truth; evidence_memory.json can
always be rebuilt from it.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

WORKSPACE = Path(__file__).parent.parent
STATE_DIR = WORKSPACE / "state" / "projects"

STOPWORDS = {
    "about", "after", "also", "and", "are", "because", "been", "between",
    "both", "can", "could", "does", "for", "from", "has", "have", "how",
    "into", "its", "may", "more", "not", "our", "over", "show", "shows",
    "such", "than", "that", "the", "their", "then", "there", "these",
    "this", "through", "using", "was", "were", "when", "which", "while",
    "with", "within", "without",
}

RELATION_TYPES = {"Support", "Extend", "Contradict"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def evidence_path(proj_dir: Path) -> Path:
    return proj_dir / "evidence.json"


def memory_path(proj_dir: Path) -> Path:
    return proj_dir / "evidence_memory.json"


def load_json(path: Path) -> dict:
    if not path.exists():
        print(f"ERROR: missing file: {path}", file=sys.stderr)
        sys.exit(1)
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def tokenize(text: str) -> List[str]:
    tokens = re.findall(
        r"[A-Za-z][A-Za-z0-9_-]{2,}|\d+(?:\.\d+)?|[\u4e00-\u9fff]{2,}",
        text.lower(),
    )
    return [t for t in tokens if t not in STOPWORDS]


def top_keywords(parts: Iterable[str], limit: int = 12) -> List[str]:
    counts: Dict[str, int] = {}
    for token in tokenize(" ".join(p for p in parts if p)):
        counts[token] = counts.get(token, 0) + 1
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return [token for token, _ in ranked[:limit]]


def memory_id_for(ev_id: str) -> str:
    if ev_id.startswith("EV-"):
        return f"MEM-{ev_id}"
    return f"MEM-{ev_id}"


def card_from_item(item: dict, previous: Optional[dict] = None) -> dict:
    original_text = item.get("original_text") or item.get("original_excerpt") or ""
    claim_text = item.get("claim_text", "")
    paper_id = item.get("paper_id", "")
    previous = previous or {}
    return {
        "memory_id": memory_id_for(item.get("ev_id", "")),
        "ev_id": item.get("ev_id", ""),
        "paper_id": paper_id,
        "stage_added": item.get("stage_added"),
        "confidence": item.get("confidence", ""),
        "source_type": item.get("source_type", ""),
        "claim_text": claim_text,
        "original_text": original_text,
        "keywords": top_keywords([paper_id, claim_text, original_text]),
        "claim_location": item.get("claim_location", ""),
        "audit_result": item.get("audit_result"),
        "usefulness_score": previous.get("usefulness_score", 0),
        "last_used_at": previous.get("last_used_at"),
        "last_used_context": previous.get("last_used_context"),
        "relations": previous.get("relations", []),
    }


def build_memory_data(slug: str, evidence: dict, previous_memory: Optional[dict] = None) -> dict:
    items = evidence.get("items", [])
    previous_by_ev = {}
    if previous_memory:
        previous_by_ev = {
            card.get("ev_id"): card
            for card in previous_memory.get("cards", [])
            if card.get("ev_id")
        }
    return {
        "schema_version": 1,
        "project": slug,
        "updated_at": now_iso(),
        "source_evidence_count": len(items),
        "cards": [card_from_item(item, previous_by_ev.get(item.get("ev_id"))) for item in items],
    }


def summarize_card(card: dict, limit: int = 180) -> str:
    text = card.get("claim_text") or card.get("original_text") or ""
    text = " ".join(text.split())
    return text[:limit]


def related_history_cards(new_card: dict, history_cards: List[dict], top_k: int = 3) -> List[dict]:
    query = " ".join([
        new_card.get("claim_text", ""),
        new_card.get("original_text", ""),
        " ".join(new_card.get("keywords", [])),
    ])
    scored = []
    for card in history_cards:
        if card.get("ev_id") == new_card.get("ev_id"):
            continue
        score = score_card(card, query)
        if score > 0:
            scored.append((score, card))
    scored.sort(key=lambda item: (-item[0], item[1].get("ev_id", "")))
    return [card for _score, card in scored[:top_k]]


def heuristic_relation(new_card: dict, old_card: dict) -> dict:
    new_text = f"{new_card.get('claim_text', '')} {new_card.get('original_text', '')}".lower()
    old_text = f"{old_card.get('claim_text', '')} {old_card.get('original_text', '')}".lower()
    shared = set(new_card.get("keywords", [])) & set(old_card.get("keywords", []))

    negative_cues = (
        "not", "no ", "does not", "do not", "cannot", "fail", "fails",
        "worse", "harm", "noisy", "noise", "limitation", "challenge",
        "contradict", "unsupported", "increase hallucination", "introduce"
    )
    positive_cues = (
        "improve", "improves", "reduce", "reduces", "increase", "increases",
        "achieve", "achieves", "outperform", "ground", "grounds"
    )

    new_neg = any(cue in new_text for cue in negative_cues)
    old_neg = any(cue in old_text for cue in negative_cues)
    new_pos = any(cue in new_text for cue in positive_cues)
    old_pos = any(cue in old_text for cue in positive_cues)

    if shared and ((new_neg and old_pos) or (old_neg and new_pos)):
        return {
            "target_ev_id": old_card.get("ev_id"),
            "relation": "Contradict",
            "reason": "Overlapping topic keywords but opposite polarity or limitation cues were detected.",
            "detector": "heuristic",
        }

    if shared and len(shared) >= 2:
        return {
            "target_ev_id": old_card.get("ev_id"),
            "relation": "Support",
            "reason": "The evidence shares core topic keywords and no contradiction cue was found.",
            "detector": "heuristic",
        }

    return {
        "target_ev_id": old_card.get("ev_id"),
        "relation": "Extend",
        "reason": "The evidence is topically related but not directly conflicting.",
        "detector": "heuristic",
    }


def classify_relations_with_llm(new_card: dict, candidates: List[dict]) -> List[dict]:
    import os

    api_key = os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return [heuristic_relation(new_card, card) for card in candidates]

    base_url = os.environ.get("CONFLICT_LLM_BASE_URL", "https://api.deepseek.com/chat/completions")
    model = os.environ.get("CONFLICT_LLM_MODEL", "deepseek-chat")
    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You classify academic evidence relations. "
                    "Return JSON only: [{\"target_ev_id\":\"EV-001\","
                    "\"relation\":\"Support|Extend|Contradict\",\"reason\":\"short reason\"}]."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "new_evidence": {
                            "ev_id": new_card.get("ev_id"),
                            "claim": summarize_card(new_card),
                            "keywords": new_card.get("keywords", []),
                        },
                        "historical_evidence": [
                            {
                                "ev_id": card.get("ev_id"),
                                "claim": summarize_card(card),
                                "keywords": card.get("keywords", []),
                            }
                            for card in candidates
                        ],
                        "task": (
                            "For each historical evidence item, decide whether the new evidence "
                            "Supports, Extends, or Contradicts it."
                        ),
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    try:
        req = Request(base_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        with urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"].strip()
        parsed = json.loads(content)
    except (HTTPError, URLError, KeyError, json.JSONDecodeError, TimeoutError):
        return [heuristic_relation(new_card, card) for card in candidates]

    results = []
    for item in parsed:
        target = item.get("target_ev_id")
        relation = item.get("relation")
        if target and relation in RELATION_TYPES:
            results.append({
                "target_ev_id": target,
                "relation": relation,
                "reason": item.get("reason", ""),
                "detector": "llm",
            })
    return results or [heuristic_relation(new_card, card) for card in candidates]


def detect_new_conflicts(memory: dict, previous_memory: Optional[dict]) -> List[dict]:
    previous_ev_ids = set()
    previous_cards = []
    if previous_memory:
        previous_cards = previous_memory.get("cards", [])
        previous_ev_ids = {card.get("ev_id") for card in previous_cards if card.get("ev_id")}

    detected = []
    history_cards = list(previous_cards)
    for card in memory.get("cards", []):
        if card.get("ev_id") in previous_ev_ids:
            continue

        candidates = related_history_cards(card, history_cards)
        if not candidates:
            history_cards.append(card)
            continue

        relations = classify_relations_with_llm(card, candidates)
        for relation in relations:
            if relation.get("relation") != "Contradict":
                continue
            target = next((c for c in candidates if c.get("ev_id") == relation.get("target_ev_id")), None)
            if not target:
                continue
            record = {
                "type": "Contradict",
                "target_ev_id": target.get("ev_id"),
                "reason": relation.get("reason", ""),
                "detected_at": now_iso(),
                "detector": relation.get("detector", "unknown"),
                "source_summary": summarize_card(card),
                "target_summary": summarize_card(target),
            }
            card.setdefault("relations", []).append(record)
            detected.append({
                "ev_id": card.get("ev_id"),
                "target_ev_id": target.get("ev_id"),
                "reason": record["reason"],
                "source_summary": record["source_summary"],
                "target_summary": record["target_summary"],
                "detector": record["detector"],
            })

        history_cards.append(card)
    return detected


def build_memory(proj_dir: Path, slug: Optional[str] = None) -> dict:
    if slug is None:
        slug = proj_dir.name
    evidence = load_json(evidence_path(proj_dir))
    previous_memory = None
    if memory_path(proj_dir).exists():
        previous_memory = load_json(memory_path(proj_dir))
    memory = build_memory_data(slug, evidence, previous_memory)
    detected = detect_new_conflicts(memory, previous_memory)
    write_json(memory_path(proj_dir), memory)
    if detected:
        memory["_last_detected_conflicts"] = detected
    return memory


def ensure_memory(proj_dir: Path, slug: str) -> dict:
    mem_path = memory_path(proj_dir)
    ev = load_json(evidence_path(proj_dir))
    ev_count = len(ev.get("items", []))
    if not mem_path.exists():
        return build_memory(proj_dir, slug)

    memory = load_json(mem_path)
    if memory.get("source_evidence_count") != ev_count:
        return build_memory(proj_dir, slug)
    return memory


def score_card(card: dict, query: str) -> float:
    terms = tokenize(query)
    if not terms:
        return 0.0

    text_parts = [
        card.get("paper_id", ""),
        card.get("claim_text", ""),
        card.get("original_text", ""),
        " ".join(card.get("keywords", [])),
    ]
    haystack = " ".join(text_parts).lower()
    score = 0.0

    if query.lower() in haystack:
        score += 5.0

    keywords = set(card.get("keywords", []))
    for term in terms:
        if term in keywords:
            score += 3.0
        if term in haystack:
            score += 1.0

    if card.get("paper_id", "").lower() == query.lower():
        score += 4.0

    confidence = card.get("confidence")
    if confidence == "high":
        score += 1.5
    elif confidence == "medium":
        score += 0.75

    audit_result = card.get("audit_result")
    if audit_result in {"faithful", "fixed"}:
        score += 1.5
    elif audit_result == "drifted":
        score -= 1.0

    score += float(card.get("usefulness_score") or 0) * 0.1
    return score


def cmd_build(proj_dir: Path, slug: str, _args: argparse.Namespace) -> None:
    memory = build_memory(proj_dir, slug)
    print(f"Built evidence memory: {len(memory.get('cards', []))} cards")
    print(f"Path: {memory_path(proj_dir)}")


def cmd_query(proj_dir: Path, slug: str, args: argparse.Namespace) -> None:
    memory = ensure_memory(proj_dir, slug)
    results = []
    for card in memory.get("cards", []):
        if card.get("audit_result") == "unsupported" and not args.include_unsupported:
            continue
        score = score_card(card, args.query)
        if score > 0:
            results.append((score, card))

    results.sort(key=lambda item: (-item[0], item[1].get("ev_id", "")))
    results = results[: args.top_k]

    if not results:
        print("No evidence memory matches.")
        return

    print(f"Evidence memory matches for: {args.query}")
    for score, card in results:
        audit = card.get("audit_result") or "unaudited"
        print(
            f"\n{card.get('ev_id')}  score={score:.2f}  "
            f"confidence={card.get('confidence') or '?'}  audit={audit}"
        )
        print(f"paper: {card.get('paper_id') or '?'}")
        if card.get("keywords"):
            print(f"keywords: {', '.join(card.get('keywords', [])[:8])}")
        claim = card.get("claim_text") or ""
        original = card.get("original_text") or ""
        if claim:
            print(f"claim: {claim[:180]}")
        if original:
            print(f"original: {original[:220]}")


def cmd_stats(proj_dir: Path, slug: str, _args: argparse.Namespace) -> None:
    memory = ensure_memory(proj_dir, slug)
    cards = memory.get("cards", [])
    high = sum(1 for c in cards if c.get("confidence") == "high")
    unsupported = sum(1 for c in cards if c.get("audit_result") == "unsupported")
    audited = sum(1 for c in cards if c.get("audit_result"))

    print("Evidence memory stats")
    print(f"cards: {len(cards)}")
    print(f"source evidence count: {memory.get('source_evidence_count', 0)}")
    print(f"high confidence: {high}")
    print(f"audited: {audited}")
    print(f"unsupported: {unsupported}")
    print(f"updated_at: {memory.get('updated_at', '')}")


def cmd_mark_used(proj_dir: Path, slug: str, args: argparse.Namespace) -> None:
    memory = ensure_memory(proj_dir, slug)
    target = None
    for card in memory.get("cards", []):
        if card.get("ev_id") == args.ev_id:
            target = card
            break

    if target is None:
        print(f"ERROR: evidence memory card not found: {args.ev_id}", file=sys.stderr)
        sys.exit(1)

    target["usefulness_score"] = int(target.get("usefulness_score") or 0) + 1
    target["last_used_at"] = now_iso()
    target["last_used_context"] = args.context
    memory["updated_at"] = now_iso()
    write_json(memory_path(proj_dir), memory)
    print(f"Marked used: {args.ev_id} ({args.context})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build and query evidence memory")
    parser.add_argument("slug", help="project slug")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("build", help="rebuild evidence_memory.json from evidence.json")

    p_query = sub.add_parser("query", help="query evidence memory")
    p_query.add_argument("query", help="search query")
    p_query.add_argument("--top-k", type=int, default=5, dest="top_k")
    p_query.add_argument("--include-unsupported", action="store_true")

    sub.add_parser("stats", help="print evidence memory statistics")

    p_used = sub.add_parser("mark-used", help="increase usefulness score for an EV")
    p_used.add_argument("ev_id", help="EV id, e.g. EV-001")
    p_used.add_argument("--context", default="", help="usage context")

    args = parser.parse_args()
    proj_dir = STATE_DIR / args.slug
    if not proj_dir.exists():
        print(f"ERROR: project does not exist: {args.slug}", file=sys.stderr)
        sys.exit(1)

    commands = {
        "build": cmd_build,
        "query": cmd_query,
        "stats": cmd_stats,
        "mark-used": cmd_mark_used,
    }
    commands[args.command](proj_dir, args.slug, args)


if __name__ == "__main__":
    main()
