import pmxt

def main():
    poly = pmxt.Polymarket()
    # kalshi = pmxt.Kalshi() 

    # Search for broad events (groups of markets)
    events = poly.search_events('Fed Chair')
    
    for event in events:
        print(f"Event: {event.title}")
        print(f"  Markets: {len(event.markets)}")
        
        # Example: Drill down into markets
        # for market in event.markets:
        #     print(f"    - {market.title}")

if __name__ == "__main__":
    main()
