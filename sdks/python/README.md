# PMXT Python SDK

A unified Python SDK for supported prediction markets.
Hosted services are the default, with local sidecar access for self-hosted venue integrations.

> **Note**: Use with a PMXT API key (hosted, recommended) or run a local PMXT service. Get a key at [pmxt.dev/dashboard](https://pmxt.dev/dashboard).

## Installation

```bash
pip install pmxt
```

**Requirements**: Python >= 3.8. The local PMXT service is bundled automatically via the `pmxt-core` dependency — only needed when self-hosting.

## Quick Start

Get your API key at [pmxt.dev/dashboard](https://pmxt.dev/dashboard). For reads, only `pmxt_api_key` and `wallet_address` are required.

```python
import pmxt

# Reads — pmxt_api_key + wallet_address only
client = pmxt.Polymarket(
    pmxt_api_key="pmxt_live_...",
    wallet_address="0xYourWalletAddress",
)

# Search for markets
markets = client.fetch_markets(query="Trump")
print(markets[0].title)

# Get outcome details
outcome = markets[0].outcomes[0]
print(f"{outcome.label}: {outcome.price * 100:.1f}%")

# Fetch historical data (use outcome.outcome_id!)
candles = client.fetch_ohlcv(
    outcome.outcome_id,
    resolution="1d",
    limit=30,
)

# Get current order book
order_book = client.fetch_order_book(outcome.outcome_id)
spread = order_book.asks[0].price - order_book.bids[0].price
print(f"Spread: {spread * 100:.2f}%")

# Account reads
positions = client.fetch_positions()
balance = client.fetch_balance()
```

### How it works (hosted)

When you pass `pmxt_api_key`, the SDK talks to the PMXT hosted services:

1. Catalog requests go to `api.pmxt.dev` (markets, events, order books, OHLCV, trades).
2. Trading requests go to `trade.pmxt.dev` (orders, positions, balances).
3. The SDK does **not** spawn a local process.
4. For Polymarket, Opinion, and Limitless, PMXT's PreFundedEscrow handles custody — you sign orders with your own key, PMXT settles on-chain.

### How it works (self-hosted)

When you omit `pmxt_api_key`, the Python SDK manages the local PMXT service for you:

1. **First API call**: Checks if server is running
2. **Auto-start**: Starts server if needed (takes ~1-2 seconds)
3. **Reuse**: Multiple Python processes share the same server
4. **Zero config**: Just import and use!

#### Manual server control (optional)

If you prefer to manage the server yourself:

```python
import pmxt

# Disable auto-start
poly = pmxt.Polymarket(auto_start_server=False)

# Or start the server manually in a separate terminal
# $ pmxt-server
```

## Trading

### Hosted trading (recommended)

With a PMXT API key, pass `pmxt_api_key`, `wallet_address`, and `private_key`. The SDK auto-wraps your key into an EIP-712 signer and PMXT settles the order on-chain.

#### Polymarket

```python
import pmxt

trader = pmxt.Polymarket(
    pmxt_api_key="pmxt_live_...",
    wallet_address="0xYourWalletAddress",
    private_key="0xYourPrivateKey",
)

balance = trader.fetch_balance()
print(f"Available: ${balance[0].available}")

order = trader.create_order(
    market_id="market-uuid",
    outcome_id="outcome-uuid",
    side="buy",
    order_type="market",
    amount=5.0,
    denom="usdc",
    slippage_pct=30.0,
)
print(f"Order status: {order.status}")
```

#### Opinion

```python
import pmxt

trader = pmxt.Opinion(
    pmxt_api_key="pmxt_live_...",
    wallet_address="0xYourWalletAddress",
    private_key="0xYourPrivateKey",
)
```

See the full [hosted trading guide](https://pmxt.dev/docs/concepts/hosted-trading) for venue support, custody model, and limits.

### Self-hosted trading (advanced)

When self-hosting, you supply venue credentials directly — no `pmxt_api_key`. The SDK spawns a local PMXT service.

#### Polymarket

Requires your **Polygon Private Key**:

```python
import os
import pmxt

poly = pmxt.Polymarket(
    private_key=os.getenv("POLYMARKET_PRIVATE_KEY"),
    proxy_address=os.getenv("POLYMARKET_PROXY_ADDRESS"),  # Optional
    # signature_type='gnosis-safe' (default)
)

# Check balance
balances = poly.fetch_balance()
print(f"Available: ${balances[0].available}")

# Place order (using outcome shorthand)
markets = poly.fetch_markets(query="Trump")
order = poly.create_order(
    outcome=markets[0].yes,
    side="buy",
    type="limit",
    amount=10,
    price=0.55
)
```

#### Kalshi

Requires **API Key** and **Private Key**:

```python
import os
import pmxt

kalshi = pmxt.Kalshi(
    api_key=os.getenv("KALSHI_API_KEY"),
    private_key=os.getenv("KALSHI_PRIVATE_KEY"),
)

# Check positions
positions = kalshi.fetch_positions()
for pos in positions:
    print(f"{pos.outcome_label}: ${pos.unrealized_pnl:.2f}")
```

#### Limitless

Requires **Private Key**:

```python
import os
import pmxt

limitless = pmxt.Limitless(
    private_key=os.getenv("LIMITLESS_PRIVATE_KEY")
)

# Check balance
balances = limitless.fetch_balance()
print(f"Available: ${balances[0].available}")
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
git clone https://github.com/pmxt-dev/pmxt.git
cd pmxt/sdks/python

# Install in development mode
pip install -e ".[dev]"

# Run tests
pytest
```

## License

MIT
