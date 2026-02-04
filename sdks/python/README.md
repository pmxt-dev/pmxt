# PMXT Python SDK

A unified Python interface for interacting with multiple prediction market exchanges (Kalshi, Polymarket).

> **Note**: This SDK requires the PMXT sidecar server to be running. See [Installation](#installation) below.

## Installation

```bash
pip install pmxt
```

**Prerequisites**: The Python SDK requires the PMXT server, which is distributed via npm:

```bash
npm install -g pmxtjs
```

That's it! The server will start automatically when you use the SDK.

## Quick Start

```python
import pmxt

# Initialize exchanges (server starts automatically!)
poly = pmxt.Polymarket()
kalshi = pmxt.Kalshi()

# Search for markets
markets = poly.fetch_markets(query="Trump")
print(markets[0].title)

# Get outcome details
outcome = markets[0].outcomes[0]
print(f"{outcome.label}: {outcome.price * 100:.1f}%")

# Fetch historical data (use outcome.outcome_id!)
candles = poly.fetch_ohlcv(
    outcome.outcome_id,
    resolution="1d",
    limit=30
)

# Get current order book
order_book = poly.fetch_order_book(outcome.outcome_id)
spread = order_book.asks[0].price - order_book.bids[0].price
print(f"Spread: {spread * 100:.2f}%")
```

### How It Works

The Python SDK automatically manages the PMXT sidecar server:

1. **First API call**: Checks if server is running
2. **Auto-start**: Starts server if needed (takes ~1-2 seconds)
3. **Reuse**: Multiple Python processes share the same server
4. **Zero config**: Just import and use!

### Manual Server Control (Optional)

If you prefer to manage the server yourself:

```python
# Disable auto-start
poly = pmxt.Polymarket(auto_start_server=False)

# Or start the server manually in a separate terminal
# $ pmxt-server
```

## Authentication (for Trading)

### Polymarket

Requires your **Polygon Private Key**:

```python
import os
import pmxt

poly = pmxt.Polymarket(
    private_key=os.getenv("POLYMARKET_PRIVATE_KEY"),
    proxy_address=os.getenv("POLYMARKET_PROXY_ADDRESS"),  # Optional
    signature_type='gnosis-safe'  # 'eoa' | 'poly-proxy' | 'gnosis-safe' (default: 'gnosis-safe')
)

# Check balance
balances = poly.fetch_balance()
print(f"Available: ${balances[0].available}")

# Place order
order = poly.create_order(
    market_id="663583",
    outcome_id="10991849...",
    side="buy",
    type="limit",
    amount=10,
    price=0.55
)
```

### Kalshi

Requires **API Key** and **Private Key**:

```python
import os
import pmxt

kalshi = pmxt.Kalshi(
    api_key=os.getenv("KALSHI_API_KEY"),
    private_key=os.getenv("KALSHI_PRIVATE_KEY")
)

# Check positions
positions = kalshi.fetch_positions()
for pos in positions:
    print(f"{pos.outcome_label}: ${pos.unrealized_pnl:.2f}")
```

## API Reference

### Market Data Methods

- `fetch_markets(params?)` - Get active markets
  ```python
  # Fetch recent markets
  poly.fetch_markets(limit=20, sort='volume')

  # Search by text
  poly.fetch_markets(query='Fed rates', limit=10)

  # Fetch by slug/ticker
  poly.fetch_markets(slug='who-will-trump-nominate-as-fed-chair')
  ```
- `filter_markets(markets, query)` - Filter markets by keyword
- `fetch_ohlcv(outcome_id, params)` - Get historical price candles
- `fetch_order_book(outcome_id)` - Get current order book
- `fetch_trades(outcome_id, params)` - Get trade history
- `get_execution_price(order_book, side, amount)` - Get execution price
- `get_execution_price_detailed(order_book, side, amount)` - Get detailed execution info

### Trading Methods (require authentication)

- `create_order(params)` - Place a new order
- `cancel_order(order_id)` - Cancel an open order
- `fetch_order(order_id)` - Get order details
- `fetch_open_orders(market_id?)` - Get all open orders

### Account Methods (require authentication)

- `fetch_balance()` - Get account balance
- `fetch_positions()` - Get current positions

## Data Models

All methods return clean Python dataclasses:

```python
@dataclass
class UnifiedMarket:
    market_id: str       # Use this for create_order
    title: str
    outcomes: List[MarketOutcome]
    volume_24h: float
    liquidity: float
    url: str
    # ... more fields

@dataclass
class MarketOutcome:
    outcome_id: str      # Use this for fetch_ohlcv/fetch_order_book/fetch_trades
    label: str           # "Trump", "Yes", etc.
    price: float         # 0.0 to 1.0 (probability)
    # ... more fields
```

See the [full API reference](../../API_REFERENCE.md) for complete documentation.

## Important Notes

### Use `outcome.outcome_id`, not `market.market_id`

For deep-dive methods like `fetch_ohlcv()`, `fetch_order_book()`, and `fetch_trades()`, you must use the **outcome ID**, not the market ID:

```python
markets = poly.fetch_markets(query="Trump")
outcome_id = markets[0].outcomes[0].outcome_id  # Correct

candles = poly.fetch_ohlcv(outcome_id, ...)  # Works
candles = poly.fetch_ohlcv(markets[0].market_id, ...)  # Wrong!
```

### Prices are 0.0 to 1.0

All prices represent probabilities (0.0 to 1.0). Multiply by 100 for percentages:

```python
outcome = markets[0].outcomes[0]
print(f"Price: {outcome.price * 100:.1f}%")  # "Price: 55.3%"
```

### Timestamps are Unix milliseconds

```python
from datetime import datetime

candle = candles[0]
dt = datetime.fromtimestamp(candle.timestamp / 1000)
print(dt)
```

## Development

```bash
# Clone the repo
git clone https://github.com/qoery-com/pmxt.git
cd pmxt/sdks/python

# Install in development mode
pip install -e ".[dev]"

# Run tests
pytest
```

## License

MIT
