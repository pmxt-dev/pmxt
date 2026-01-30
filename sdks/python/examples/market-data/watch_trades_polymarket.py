import pmxt
import time
from datetime import datetime

def run():
    api = pmxt.Polymarket()
    
    # 1. Search for the broad Event
    print("Searching for Event: Fed Chair...")
    events = api.search_events("Who will Trump nominate as Fed Chair?")
    event = events[0]
    print(f"Found Event: {event.title}")
    
    # 2. Search for the specific Market within that event
    print("Searching for Market: Kevin Warsh...")
    market = event.search_markets("Kevin Warsh")[0]
    outcome = market.yes
    asset_id = outcome.id

    print(f"Watching trades for: {market.title}")
    print(f"Outcome: {outcome.label} (Asset ID: {asset_id})\n")

    while True:
        try:
            trades = api.watch_trades(asset_id)
            for trade in trades:
                side_str = trade.side.upper().rjust(4)
                amount_str = f"{trade.amount:10,.0f}"
                price_str = f"${trade.price:.3f}"
                time_str = datetime.fromtimestamp(trade.timestamp / 1000).strftime('%H:%M:%S')
                
                print(f"[TRADE] {side_str} | {amount_str} shares @ {price_str} | {time_str}")
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(1)

if __name__ == "__main__":
    run()
