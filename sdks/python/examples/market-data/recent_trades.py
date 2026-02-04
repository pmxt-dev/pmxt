import pmxt

def main():
    # Kalshi
    kalshi = pmxt.Kalshi()
    k_markets = kalshi.fetch_markets(query="Fed Chair")
    k_market = kalshi.filter_markets(k_markets, "Kevin Warsh")[0]

    k_trades = kalshi.fetch_trades(k_market.yes.outcome_id, limit=10)
    print('Kalshi:', k_trades)

    # Polymarket
    poly = pmxt.Polymarket()
    p_markets = poly.fetch_markets(query='Fed Chair')
    p_market = poly.filter_markets(p_markets, 'Kevin Warsh')[0]

    p_trades = poly.fetch_trades(p_market.yes.outcome_id, limit=10)
    print('Polymarket:', p_trades)

if __name__ == "__main__":
    main()
