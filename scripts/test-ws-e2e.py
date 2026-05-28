#!/usr/bin/env python3
"""PMXT WebSocket streaming example — two markets concurrently."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdks", "python"))
from pmxt import Polymarket

poly = Polymarket()
markets = poly.fetch_markets(params={"limit": 2})
ids = [m.outcomes[0].outcome_id for m in markets]
titles = {m.outcomes[0].outcome_id: m.title[:20] for m in markets}

while True:
    books = poly.watch_order_books(ids)
    for oid, ob in books.items():
        bid = ob.bids[0].price if ob.bids else "-"
        ask = ob.asks[0].price if ob.asks else "-"
        print(f"{titles.get(oid, oid[:20])}: {bid} | {ask}", flush=True)
