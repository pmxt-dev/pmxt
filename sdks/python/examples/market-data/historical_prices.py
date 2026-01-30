import pmxt

def main():
    api = pmxt.Polymarket()
    events = api.search_events("Who will Trump nominate as Fed Chair?")
    event = events[0]
    
    market = event.search_markets("Kevin Warsh")[0]
    
    # Note: in Python wrapper we use outcome.id which is already clobTokenId for Poly
    history = api.fetch_ohlcv(market.yes.id, pmxt.HistoryFilterParams(
        resolution='1h',
        limit=5
    ))
    print(history)

if __name__ == "__main__":
    main()
