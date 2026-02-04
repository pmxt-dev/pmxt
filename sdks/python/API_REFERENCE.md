# PMXT Python SDK - API Reference

A unified Python interface for interacting with multiple prediction market exchanges (Kalshi, Polymarket) identically.

## Installation

```bash
pip install pmxt
```

## Quick Start

```python
import pmxt

# Initialize exchanges (server starts automatically!)
poly = pmxt.Polymarket()
kalshi = pmxt.Kalshi()

# Search for markets
markets = poly.search_markets("Trump")
print(markets[0].title)
```

> **Note**: This SDK automatically manages the PMXT sidecar server. Just import and use!

---

## Server Management

The SDK provides global functions to manage the background sidecar server. This is useful for clearing state, resolving "port busy" errors, or ensuring a clean slate in interactive environments like Jupyter.

### `stop_server`

Stop the background PMXT sidecar server and clean up lock files.

```python
import pmxt
pmxt.stop_server()
```

### `restart_server`

Restart the background PMXT sidecar server. Equivalent to calling `stop_server()` followed by a fresh start.

```python
import pmxt
pmxt.restart_server()
```

---

## Methods

### `fetch_markets`

Fetch Markets

Fetch Markets

**Signature:**

```python
def fetch_markets(params: Optional[MarketFilterParams] = None) -> List[UnifiedMarket]:
```

**Parameters:**

- `params` (MarketFilterParams) - **Optional**: Filter parameters

**Returns:** `List[UnifiedMarket]` - List of unified markets

**Example:**

```python
markets = poly.fetch_markets(pmxt.MarketFilterParams(
    limit=20,
    sort='volume'  # 'volume' | 'liquidity' | 'newest'
))
```


---
### `fetch_o_h_l_c_v`

Fetch OHLCV Candles

Fetch OHLCV Candles

**Signature:**

```python
def fetch_o_h_l_c_v(id: str, params: Optional[HistoryFilterParams] = None) -> List[PriceCandle]:
```

**Parameters:**

- `id` (str): id
- `params` (HistoryFilterParams) - **Optional**: Filter parameters

**Returns:** `List[PriceCandle]` - Historical prices

**Example:**

```python
markets = poly.search_markets('Trump')
outcome_id = markets[0].outcomes[0].id  # Get the outcome ID

candles = poly.fetch_ohlcv(outcome_id, pmxt.HistoryFilterParams(
    resolution='1h',  # '1m' | '5m' | '15m' | '1h' | '6h' | '1d'
    start=datetime(2024, 1, 1),
    end=datetime(2024, 1, 31),
    limit=100
))
```

**Notes:**
**CRITICAL**: Use `outcome.id`, not `market.id`.
- **Polymarket**: `outcome.id` is the CLOB Token ID
- **Kalshi**: `outcome.id` is the Market Ticker

---
### `fetch_order_book`

Fetch Order Book

Fetch Order Book

**Signature:**

```python
def fetch_order_book() -> OrderBook:
```

**Parameters:**

- None

**Returns:** `OrderBook` - Current order book

**Example:**

```python
order_book = kalshi.fetch_order_book('FED-25JAN')
print(f'Best bid: {order_book.bids[0].price}')
print(f'Best ask: {order_book.asks[0].price}')
```


---
### `fetch_trades`

Fetch Trades

Fetch Trades

**Signature:**

```python
def fetch_trades(id: str, params: Optional[HistoryFilterParams] = None) -> List[Trade]:
```

**Parameters:**

- `id` (str): id
- `params` (HistoryFilterParams) - **Optional**: Filter parameters

**Returns:** `List[Trade]` - Recent trades

**Example:**

```python
trades = kalshi.fetch_trades('FED-25JAN', pmxt.HistoryFilterParams(
    resolution='1h',
    limit=100
))
```

**Notes:**
**Note**: Polymarket requires API key. Use `fetchOHLCV` for public historical data.

---
### `fetch_events`

Fetch Events

Fetch Events

**Signature:**

```python
def fetch_events(params: Optional[EventFetchParams] = None) -> List[UnifiedEvent]:
```

**Parameters:**

- `params` (EventFetchParams) - **Optional**: Filter parameters

**Returns:** `List[UnifiedEvent]` - List of unified events

**Example:**

```python
# No example available
```


---
### `watch_order_book`

Watch Order Book (WebSocket Stream)

Subscribe to real-time order book updates via WebSocket. Returns a promise that resolves with the next order book update. Call repeatedly in a loop to stream updates (CCXT Pro pattern).


**Signature:**

```python
def watch_order_book(outcome_id: str, limit: Optional[Any] = None) -> OrderBook:
```

**Parameters:**

- `outcome_id` (str): outcomeId
- `limit` (Any) - **Optional**: limit

**Returns:** `OrderBook` - Next order book update

**Example:**

```python
# No example available
```


---
### `watch_trades`

Watch Trades (WebSocket Stream)

Subscribe to real-time trade updates via WebSocket. Returns a promise that resolves with the next trade(s). Call repeatedly in a loop to stream updates (CCXT Pro pattern).


**Signature:**

```python
def watch_trades(outcome_id: str, since: Optional[Any] = None, limit: Optional[Any] = None) -> List[Trade]:
```

**Parameters:**

- `outcome_id` (str): outcomeId
- `since` (Any) - **Optional**: since
- `limit` (Any) - **Optional**: limit

**Returns:** `List[Trade]` - Next trade update(s)

**Example:**

```python
# No example available
```


---
### `watch_prices`

Watch Prices (WebSocket Stream)

Watch Prices (WebSocket Stream)

**Signature:**

```python
def watch_prices() -> Any:
```

**Parameters:**

- None

**Returns:** `Any` - Price update

**Example:**

```python
# No example available
```


---
### `watch_user_positions`

Watch User Positions (WebSocket Stream)

Watch User Positions (WebSocket Stream)

**Signature:**

```python
def watch_user_positions() -> Any:
```

**Parameters:**

- None

**Returns:** `Any` - User position update

**Example:**

```python
# No example available
```


---
### `watch_user_transactions`

Watch User Transactions (WebSocket Stream)

Watch User Transactions (WebSocket Stream)

**Signature:**

```python
def watch_user_transactions() -> Any:
```

**Parameters:**

- None

**Returns:** `Any` - User transaction update

**Example:**

```python
# No example available
```


---
### `create_order`

Create Order

Create Order

**Signature:**

```python
def create_order(params: Optional[CreateOrderParams] = None) -> Order:
```

**Parameters:**

- `params` (CreateOrderParams) - **Optional**: Filter parameters

**Returns:** `Order` - Order created

**Example:**

```python
# Limit Order Example
order = poly.create_order(pmxt.CreateOrderParams(
    market_id='663583',
    outcome_id='109918492287...',
    side='buy',
    type='limit',
    amount=10,        # Number of contracts
    price=0.55        # Required for limit orders (0.0-1.0)
))

print(f'Order {order.id}: {order.status}')

# Market Order Example
order = kalshi.create_order(pmxt.CreateOrderParams(
    market_id='FED-25JAN',
    outcome_id='FED-25JAN-YES',
    side='sell',
    type='market',
    amount=5          # Price not needed for market orders
))
```


---
### `cancel_order`

Cancel Order

Cancel Order

**Signature:**

```python
def cancel_order() -> Order:
```

**Parameters:**

- None

**Returns:** `Order` - Order cancelled

**Example:**

```python
cancelled_order = poly.cancel_order('order-123')
print(cancelled_order.status) # 'cancelled'
```


---
### `fetch_order`

Fetch Order

Fetch Order

**Signature:**

```python
def fetch_order() -> Order:
```

**Parameters:**

- None

**Returns:** `Order` - Order details

**Example:**

```python
order = kalshi.fetch_order('order-456')
print(f'Filled: {order.filled}/{order.amount}')
```


---
### `fetch_open_orders`

Fetch Open Orders

Fetch Open Orders

**Signature:**

```python
def fetch_open_orders() -> List[Order]:
```

**Parameters:**

- None

**Returns:** `List[Order]` - List of open orders

**Example:**

```python
# All open orders
all_orders = poly.fetch_open_orders()

# Open orders for specific market
market_orders = kalshi.fetch_open_orders('FED-25JAN')

for order in all_orders:
    print(f'{order.side} {order.amount} @ {order.price}')
```


---
### `fetch_positions`

Fetch Positions

Fetch Positions

**Signature:**

```python
def fetch_positions() -> List[Position]:
```

**Parameters:**

- None

**Returns:** `List[Position]` - User positions

**Example:**

```python
positions = kalshi.fetch_positions()
for pos in positions:
    print(f"{pos.outcome_label}: {pos.size} @ ${pos.entry_price}")
    print(f"Unrealized P&L: ${pos.unrealized_pnl}")
```


---
### `fetch_balance`

Fetch Balance

Fetch Balance

**Signature:**

```python
def fetch_balance() -> List[Balance]:
```

**Parameters:**

- None

**Returns:** `List[Balance]` - Account balances

**Example:**

```python
balances = poly.fetch_balance()
print(balances)
# [Balance(currency='USDC', total=1000, available=950, locked=50)]
```


---
### `get_execution_price`

Get Execution Price

Get Execution Price

**Signature:**

```python
def get_execution_price(order_book: str, side: OrderBook, amount: OrderBook) -> Any:
```

**Parameters:**

- `order_book` (str): orderBook
- `side` (OrderBook): side
- `amount` (OrderBook): amount

**Returns:** `Any` - Average execution price

**Example:**

```python
# No example available
```


---
### `get_execution_price_detailed`

Get Detailed Execution Price

Get Detailed Execution Price

**Signature:**

```python
def get_execution_price_detailed(order_book: str, side: OrderBook, amount: OrderBook) -> ExecutionPriceResult:
```

**Parameters:**

- `order_book` (str): orderBook
- `side` (OrderBook): side
- `amount` (OrderBook): amount

**Returns:** `ExecutionPriceResult` - Detailed execution result

**Example:**

```python
# No example available
```


---
### `filter_markets`

Filter Markets

Filter a list of markets by criteria. Can filter by string query, structured criteria object, or custom filter function.


**Signature:**

```python
def filter_markets(markets: Any, criteria: Any) -> List[UnifiedMarket]:
```

**Parameters:**

- `markets` (Any): markets
- `criteria` (Any): criteria

**Returns:** `List[UnifiedMarket]` - Filtered markets

**Example:**

```python
# Simple text search
filtered = poly.filter_markets(markets, 'Trump')

# Advanced criteria
undervalued = poly.filter_markets(markets, {
    'text': 'Election',
    'volume_24h': {'min': 10000},
    'price': {'outcome': 'yes', 'max': 0.4}
})

# Custom function
volatile = poly.filter_markets(markets, lambda m: m.yes and m.yes.price_change_24h < -0.1)
```


---
### `filter_events`

Filter Events

Filter a list of events by criteria. Can filter by string query, structured criteria object, or custom filter function.


**Signature:**

```python
def filter_events(events: Any, criteria: Any) -> List[UnifiedEvent]:
```

**Parameters:**

- `events` (Any): events
- `criteria` (Any): criteria

**Returns:** `List[UnifiedEvent]` - Filtered events

**Example:**

```python
filtered = poly.filter_events(events, {
    'category': 'Politics',
    'market_count': {'min': 5}
})
```


---
### `close`

Close WebSocket Connections

Close all WebSocket connections and cleanup resources. Call this when you're done streaming to properly release connections.


**Signature:**

```python
def close() -> Any:
```

**Parameters:**

- None

**Returns:** `Any` - WebSocket connections closed successfully

**Example:**

```python
# No example available
```


---
### `search_markets`

searchMarkets



**Signature:**

```python
def search_markets() -> Any:
```

**Parameters:**

- None

**Returns:** `Any` - 

**Example:**

```python
results = kalshi.search_markets('Fed rates', pmxt.MarketFilterParams(
    limit=10,
    search_in='title'  # 'title' (default) | 'description' | 'both'
))
```


---
### `search_events`

searchEvents



**Signature:**

```python
def search_events() -> Any:
```

**Parameters:**

- None

**Returns:** `Any` - 

**Example:**

```python
events = poly.search_events('Who will Trump nominate as Fed Chair?')
# Filter for specific market within the event
warsh = poly.filter_markets(events[0].markets, 'Kevin Warsh')[0]
```


---
### `get_markets_by_slug`

getMarketsBySlug



**Signature:**

```python
def get_markets_by_slug() -> Any:
```

**Parameters:**

- None

**Returns:** `Any` - 

**Example:**

```python
# Polymarket: use URL slug
poly_markets = poly.get_markets_by_slug('who-will-trump-nominate-as-fed-chair')

# Kalshi: use market ticker (auto-uppercased)
kalshi_markets = kalshi.get_markets_by_slug('KXFEDCHAIRNOM-29')
```


---

## Complete Trading Workflow

```python
import pmxt
import os

exchange = pmxt.Polymarket(
    private_key=os.getenv('POLYMARKET_PRIVATE_KEY')
)

# 1. Check balance
balances = exchange.fetch_balance()
if balances:
    balance = balances[0]
    print(f'Available: ${balance.available}')

# 2. Search for a market
markets = exchange.search_markets('Trump')
market = markets[0]
outcome = market.outcomes[0]

# 3. Place a limit order
order = exchange.create_order(pmxt.CreateOrderParams(
    market_id=market.id,
    outcome_id=outcome.id,
    side='buy',
    type='limit',
    amount=10,
    price=0.50
))

print(f'Order placed: {order.id}')

# 4. Check order status
updated_order = exchange.fetch_order(order.id)
print(f'Status: {updated_order.status}')
print(f'Filled: {updated_order.filled}/{updated_order.amount}')

# 5. Cancel if needed
if updated_order.status == 'open':
    exchange.cancel_order(order.id)
    print('Order cancelled')

# 6. Check positions
positions = exchange.fetch_positions()
for pos in positions:
    pnl_sign = '+' if pos.unrealized_pnl > 0 else ''
    print(f'{pos.outcome_label}: {pnl_sign}${pos.unrealized_pnl:.2f}')
```

## Data Models

### `UnifiedMarket`



```python
@dataclass
class UnifiedMarket:
market_id: str # The unique identifier for this market
title: str # 
description: str # 
outcomes: List[MarketOutcome] # 
resolution_date: str # 
volume24h: float # 
volume: float # 
liquidity: float # 
open_interest: float # 
url: str # 
image: str # 
category: str # 
tags: List[string] # 
yes: MarketOutcome # 
no: MarketOutcome # 
up: MarketOutcome # 
down: MarketOutcome # 
```

---
### `MarketOutcome`



```python
@dataclass
class MarketOutcome:
outcome_id: str # Outcome ID for trading operations (CLOB Token ID for Polymarket, Market Ticker for Kalshi)
label: str # 
price: float # 
price_change24h: float # 
metadata: object # Exchange-specific metadata (e.g., clobTokenId for Polymarket)
```

---
### `UnifiedEvent`

A grouped collection of related markets (e.g., "Who will be Fed Chair?" contains multiple candidate markets)

```python
@dataclass
class UnifiedEvent:
id: str # 
title: str # 
description: str # 
slug: str # 
markets: List[UnifiedMarket] # 
url: str # 
image: str # 
category: str # 
tags: List[string] # 
```

---
### `PriceCandle`



```python
@dataclass
class PriceCandle:
timestamp: int # 
open: float # 
high: float # 
low: float # 
close: float # 
volume: float # 
```

---
### `OrderBook`



```python
@dataclass
class OrderBook:
bids: List[OrderLevel] # 
asks: List[OrderLevel] # 
timestamp: int # 
```

---
### `OrderLevel`



```python
@dataclass
class OrderLevel:
price: float # 
size: float # 
```

---
### `Trade`



```python
@dataclass
class Trade:
id: str # 
price: float # 
amount: float # 
side: str # 
timestamp: int # 
```

---
### `Order`



```python
@dataclass
class Order:
id: str # 
market_id: str # 
outcome_id: str # 
side: str # 
type: str # 
price: float # 
amount: float # 
status: str # 
filled: float # 
remaining: float # 
timestamp: int # 
fee: float # 
```

---
### `Position`



```python
@dataclass
class Position:
market_id: str # 
outcome_id: str # 
outcome_label: str # 
size: float # 
entry_price: float # 
current_price: float # 
unrealized_pn_l: float # 
realized_pn_l: float # 
```

---
### `Balance`



```python
@dataclass
class Balance:
currency: str # 
total: float # 
available: float # 
locked: float # 
```

---
### `ExecutionPriceResult`



```python
@dataclass
class ExecutionPriceResult:
price: float # 
filled_amount: float # 
fully_filled: bool # 
```

---
### `ExchangeCredentials`

Optional authentication credentials for exchange operations

```python
@dataclass
class ExchangeCredentials:
api_key: str # API key for the exchange
private_key: str # Private key for signing transactions
api_secret: str # API secret (if required by exchange)
passphrase: str # Passphrase (if required by exchange)
funder_address: str # The address funding the trades (Proxy address)
signature_type: Any # Signature type (0=EOA, 1=Poly Proxy, 2=Gnosis Safe, or names like 'gnosis_safe')
```

---

## Filter Parameters

### `BaseRequest`

Base request structure with optional credentials

```python
@dataclass
class BaseRequest:
credentials: ExchangeCredentials # 
```

---
### `MarketFilterParams`



```python
@dataclass
class MarketFilterParams:
limit: int # 
offset: int # 
sort: str # 
search_in: str # 
query: str # 
slug: str # 
page: int # 
similarity_threshold: float # 
```

---
### `EventFetchParams`



```python
@dataclass
class EventFetchParams:
query: str # 
limit: int # 
offset: int # 
search_in: str # 
```

---
### `HistoryFilterParams`



```python
@dataclass
class HistoryFilterParams:
resolution: str # 
start: str # 
end: str # 
limit: int # 
```

---
### `CreateOrderParams`



```python
@dataclass
class CreateOrderParams:
market_id: str # 
outcome_id: str # 
side: str # 
type: str # 
amount: float # 
price: float # 
fee: float # 
```

---
