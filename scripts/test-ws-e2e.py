#!/usr/bin/env python3
import sys, os, asyncio, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdks", "python"))
import websockets
from pmxt import Polymarket

RELAY = "ws://127.0.0.1:9100/?key=testkey"

async def main():
    poly = Polymarket()
    markets = poly.fetch_markets(params={"limit": 2})
    ids = [m.outcomes.yes.outcome_id for m in markets]
    titles = {m.outcomes.yes.outcome_id: m.title[:20] for m in markets}
    async with websockets.connect(RELAY) as ws:
        await ws.send(json.dumps({
            "op": "subscribe", "source": "polymarket",
            "filter": {"asset_ids": ids},
        }))
        while True:
            msg = json.loads(await ws.recv())
            if msg.get("op") != "event":
                continue
            oid = msg["asset_id"]
            bid = msg["bids"][-1][0] if msg["bids"] else "-"
            ask = msg["asks"][-1][0] if msg["asks"] else "-"
            print(f"{titles.get(oid, oid[:20])}: {bid} | {ask}", flush=True)

asyncio.run(main())
