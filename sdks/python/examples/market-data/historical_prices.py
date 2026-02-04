import pmxt

def main():
    api = pmxt.Polymarket()
    events = api.fetch_events(query="Who will Trump nominate as Fed Chair?")
    event = events[0]

    market = api.filter_markets(event.markets, "Kevin Warsh")[0]

    # Use outcome.outcome_id for fetching historical data
    # (Polymarket: CLOB Token ID, Kalshi: Market Ticker)
    history = api.fetch_ohlcv(
        market.yes.outcome_id,
        resolution='1h',
        limit=5
    )
    print(history)

if __name__ == "__main__":
    main()
