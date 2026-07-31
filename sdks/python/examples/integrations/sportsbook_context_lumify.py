"""Read-only: PMXT sports markets + optional Lumify sportsbook context.

PMXT finds prediction-market contracts (Polymarket / Kalshi). Lumify optionally
adds sportsbook odds / explainable intelligence for the underlying game.

Never places orders. Requires:
  pip install pmxt requests

Env:
  PMXT_API_KEY   — optional; if unset, SDK uses self-hosted local reads
  LUMIFY_API_KEY — optional; if unset, only PMXT section runs
"""

from __future__ import annotations

import argparse
import os
import sys

import pmxt

try:
    import requests
except ImportError:  # pragma: no cover
    requests = None  # type: ignore


LUMIFY_BASE = "https://lumify.ai"


def _pmxt_clients(api_key: str | None):
    kwargs = {"pmxt_api_key": api_key} if api_key else {}
    return pmxt.Polymarket(**kwargs), pmxt.Kalshi(**kwargs)


def fetch_pmxt_sports_markets(query: str, limit: int = 5):
    api_key = os.environ.get("PMXT_API_KEY") or os.environ.get("pmxt_api_key")
    poly, kalshi = _pmxt_clients(api_key)

    results = []
    for venue_name, client in (("polymarket", poly), ("kalshi", kalshi)):
        try:
            markets = client.fetch_markets(query=query, limit=limit)
        except Exception as exc:  # noqa: BLE001 - example should keep going
            print(f"[pmxt:{venue_name}] fetch_markets failed: {exc}", file=sys.stderr)
            continue
        for market in markets[:limit]:
            title = getattr(market, "title", None) or getattr(market, "question", None) or str(market)
            results.append({"venue": venue_name, "title": title, "raw": market})
    return results


def fetch_lumify_context(query: str, limit: int = 3):
    if requests is None:
        print("install requests to enable Lumify section: pip install requests", file=sys.stderr)
        return None

    key = os.environ.get("LUMIFY_API_KEY")
    if not key:
        print("LUMIFY_API_KEY unset — skipping sportsbook context (get a free key at https://lumify.ai/docs/ai)")
        return None

    headers = {"Authorization": f"Bearer {key}", "User-Agent": "pmxt-example-sportsbook-context/0.1"}

    # Natural-language → list filters (rule-based on Lumify's side)
    q = requests.post(
        f"{LUMIFY_BASE}/v1/query",
        headers={**headers, "Content-Type": "application/json"},
        json={"query": query, "limit": limit},
        timeout=30,
    )
    q.raise_for_status()
    payload = q.json()
    events = payload.get("data") or payload.get("events") or []

    enriched = []
    for event in events[:limit]:
        event_id = event.get("id")
        row = {"event": event, "odds": None, "intelligence": None}
        if event_id is None:
            enriched.append(row)
            continue
        odds = requests.get(
            f"{LUMIFY_BASE}/v1/events/{event_id}/odds",
            headers=headers,
            timeout=30,
        )
        if odds.ok:
            row["odds"] = odds.json()
        intel = requests.get(
            f"{LUMIFY_BASE}/v1/events/{event_id}/intelligence",
            headers=headers,
            timeout=30,
        )
        if intel.ok:
            row["intelligence"] = intel.json()
        enriched.append(row)
    return {"query_response": payload, "enriched": enriched}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", default="NBA", help="Sports search query for both APIs")
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()

    print("=== PMXT prediction markets (read-only) ===")
    markets = fetch_pmxt_sports_markets(args.query, limit=args.limit)
    if not markets:
        print("No markets returned.")
    for i, m in enumerate(markets, 1):
        print(f"{i}. [{m['venue']}] {m['title']}")

    print("\n=== Lumify sportsbook context (optional, read-only) ===")
    # Prefer a schedule-oriented NL query for Lumify
    lumify_query = f"{args.query} scheduled games"
    ctx = fetch_lumify_context(lumify_query, limit=min(args.limit, 3))
    if not ctx:
        return

    interpreted = (ctx["query_response"] or {}).get("interpreted")
    if interpreted:
        print("interpreted:", interpreted)

    for i, row in enumerate(ctx["enriched"], 1):
        ev = row["event"] or {}
        label = ev.get("name") or ev.get("title") or ev.get("id")
        print(f"{i}. event={label}")
        if row["odds"] is not None:
            print("   odds: available")
        if row["intelligence"] is not None:
            intel = row["intelligence"]
            # Keep output short — full payload is large
            conf = None
            if isinstance(intel, dict):
                conf = intel.get("confidence") or intel.get("data", {}).get("confidence")
            print(f"   intelligence: available (confidence={conf!r})")

    print(
        "\nResearch only — not trading advice. Place PMXT orders only if the user "
        "explicitly asks in the current session."
    )


if __name__ == "__main__":
    main()
