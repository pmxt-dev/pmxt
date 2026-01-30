import pmxt
import os
from datetime import datetime
import time

def run():
    api = pmxt.Polymarket()

    # 1. Search for the broad Event
    print("Searching for Event: Fed Chair...")
    events = api.search_events("Who will Trump nominate as Fed Chair?")
    event = events[0]
    
    # 2. Search for the specific Market within that event
    print("Searching for Market: Kevin Warsh...")
    market = event.search_markets("Kevin Warsh")[0]
    outcome = market.yes
    asset_id = outcome.id

    print(f"Watching equilibrium for: {market.title}")
    print(f"Outcome: {outcome.label} (Asset ID: {asset_id})\n")

    while True:
        try:
            book = api.watch_order_book(asset_id)

            # Clear screen (cross-platform)
            os.system('cls' if os.name == 'nt' else 'clear')
            
            print(f"Market: {market.title}")
            print(f"Outcome: {outcome.label} | Time: {datetime.now().strftime('%H:%M:%S')}\n")

            print("--- ASKS (Sellers) ---")
            top_asks = book.asks[:5]
            top_asks.reverse()
            for a in top_asks:
                print(f"  ${a.price:.3f} | {a.size:10,}")

            if len(book.asks) > 0 and len(book.bids) > 0:
                spread = book.asks[0].price - book.bids[0].price
                mid = (book.asks[0].price + book.bids[0].price) / 2
                print(f"\n>> SPREAD: {spread:.3f} | MID: ${mid:.3f} <<\n")
            else:
                print("\n--- SPREAD N/A ---\n")

            print("--- BIDS (Buyers) ---")
            top_bids = book.bids[:5]
            for b in top_bids:
                print(f"  ${b.price:.3f} | {b.size:10,}")

            print("\n(Watching live updates...)")
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(1)

if __name__ == "__main__":
    run()
