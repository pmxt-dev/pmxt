import pmxt
import os
import sys
from datetime import datetime

def run():
    # 1. Check for credentials first
    api_key = os.getenv('KALSHI_API_KEY')
    private_key = os.getenv('KALSHI_PRIVATE_KEY')

    if not api_key or not private_key:
        print("Error: KALSHI_API_KEY and KALSHI_PRIVATE_KEY environment variables must be set.")
        sys.exit(1)

    # 2. Initialize the client
    api = pmxt.Kalshi(
        api_key=api_key,
        private_key=private_key
    )
    
    # Search for market
    print("Searching for Event: Serie A...")
    events = api.search_events("Serie A")
    event = events[0]
    
    print("Searching for Market: Juventus vs Napoli...")
    market = event.search_markets("Juventus vs Napoli")[0]
    
    # For now, Kalshi markets are 1:1 with tickers in pmxt models
    ticker = market.id
    
    print(f"Watching equilibrium for: {market.title}")
    print(f"Ticker: {ticker}\n")

    try:
        while True:
            # Note: watch_order_book is the Python snake_case convention
            orderbook = api.watch_order_book(ticker)
            
            # Use ANSI escape sequences for a clean live dashboard update
            # \033[H = move cursor to home position, \033[J = clear screen
            print("\033[H\033[J", end="") 
            print(f"Market: {title}")
            print(f"Ticker: {ticker} | Time: {datetime.fromtimestamp(orderbook.timestamp / 1000).strftime('%H:%M:%S')}\n")
            
            print("--- ASKS (Sellers) ---")
            # Reverse for visual price ladder (highest ask at top)
            for ask in reversed(orderbook.asks[:5]):
                print(f"  ${ask.price:.3f} | {ask.size:10,.0f}")
            
            if orderbook.bids and orderbook.asks:
                spread = orderbook.asks[0].price - orderbook.bids[0].price
                mid = (orderbook.asks[0].price + orderbook.bids[0].price) / 2
                print(f"\n>> SPREAD: {spread:.3f} | MID: ${mid:.3f} <<\n")
            else:
                print("\n--- SPREAD N/A ---\n")
            
            print("--- BIDS (Buyers) ---")
            for bid in orderbook.bids[:5]:
                print(f"  ${bid.price:.3f} | {bid.size:10,.0f}")
            
            print("\n(Watching live updates...)")
                
    except KeyboardInterrupt:
        print("\nStopping...")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        # close() is now a no-op method for compatibility
        if hasattr(api, 'close'):
            api.close()

if __name__ == "__main__":
    run()
