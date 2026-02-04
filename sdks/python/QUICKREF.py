"""
PMXT Python SDK - Quick Reference

Installation:
    pip install pmxt

Start Server:
    npm install -g pmxtjs
    pmxt-server

Basic Usage:
    import pmxt

    poly = pmxt.Polymarket()
    markets = poly.fetch_markets(query="Trump")

    outcome = markets[0].outcomes[0]
    candles = poly.fetch_ohlcv(
        outcome.outcome_id,
        resolution="1d",
        limit=30
    )

Authentication:
    # Polymarket
    poly = pmxt.Polymarket(
        private_key=os.getenv("POLYMARKET_PRIVATE_KEY")
    )
    
    # Kalshi
    kalshi = pmxt.Kalshi(
        api_key=os.getenv("KALSHI_API_KEY"),
        private_key=os.getenv("KALSHI_PRIVATE_KEY")
    )

Market Data Methods:
    fetch_markets(query?, **kwargs)     # Get active markets
    fetch_events(query?, **kwargs)      # Get events
    fetch_ohlcv(outcome_id, **kwargs)   # Historical candles
    fetch_order_book(outcome_id)        # Current order book
    fetch_trades(outcome_id, **kwargs)  # Trade history
    watch_order_book(outcome_id)        # WebSocket order book updates
    watch_trades(outcome_id)            # WebSocket trade updates

Trading Methods (require auth):
    create_order(...)                   # Place order (direct args)
    cancel_order(order_id)              # Cancel order
    fetch_order(order_id)               # Get order details
    fetch_open_orders(market_id?)       # Get open orders

Account Methods (require auth):
    fetch_balance()                     # Get balance
    fetch_positions()                   # Get positions

Important Notes:
    - Use outcome.outcome_id, not market.market_id for OHLCV/orderbook/trades
    - Prices are 0.0 to 1.0 (multiply by 100 for %)
    - Timestamps are Unix milliseconds
    - Server must be running on localhost:3847

Example - Complete Workflow:
    import pmxt

    # Initialize
    poly = pmxt.Polymarket(private_key=os.getenv("POLYMARKET_PRIVATE_KEY"))

    # Search
    markets = poly.fetch_markets(query="Trump")
    market = markets[0]
    outcome = market.outcomes[0]

    # Check balance
    balance = poly.fetch_balance()[0]
    print(f"Available: ${balance.available}")

    # Place order
    order = poly.create_order(
        market_id=market.market_id,
        outcome_id=outcome.outcome_id,
        side="buy",
        type="limit",
        amount=10,
        price=0.50
    )

    # Check positions
    positions = poly.fetch_positions()
    for pos in positions:
        print(f"{pos.outcome_label}: ${pos.unrealized_pnl:.2f}")
"""
