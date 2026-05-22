import os
import sys
import csv
import asyncio
from io import StringIO
from pmxt import Polymarket
from tqdm import tqdm

CONCURRENCY = 10


async def main():
    start_ts = int(sys.argv[1]) if len(sys.argv) > 1 else 1775779200
    end_ts = int(sys.argv[2]) if len(sys.argv) > 2 else 1775865600
    first_boundary = -(-start_ts // 900) * 900  # ceil to 900

    timestamps = list(range(first_boundary, end_ts + 1, 900))
    poly = Polymarket(pmxt_api_key=os.environ["PMXT_API_KEY"])

    rows: list[list[str]] = []
    sem = asyncio.Semaphore(CONCURRENCY)

    async def process(ts: int):
        async with sem:
            slug = f"btc-updown-15m-{ts}"
            events = await poly.fetch_events(slug=slug)
            if not events or not events[0].markets:
                return []
            local_rows = []
            for outcome in events[0].markets[0].outcomes:
                candles = await poly.fetch_ohlcv(
                    outcome.outcome_id,
                    resolution="1m",
                    start=(ts - 1800) * 1000,
                    end=(ts + 1800) * 1000,
                )
                for c in candles:
                    local_rows.append([
                        slug, outcome.label, c.timestamp,
                        c.open, c.high, c.low, c.close, c.volume,
                    ])
            return local_rows

    tasks = [process(ts) for ts in timestamps]
    for coro in tqdm(asyncio.as_completed(tasks), total=len(tasks)):
        result = await coro
        rows.extend(result)

    out_path = f"btc-updown-dataset-{start_ts}-{end_ts}.csv"
    with open(out_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["slug", "outcome_label", "timestamp", "open", "high", "low", "close", "volume"])
        w.writerows(rows)


asyncio.run(main())
