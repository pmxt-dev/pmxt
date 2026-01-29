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

## Methods

### `fetch_markets`

Fetch Markets

Fetch Markets

**Signature:**

```python
def fetch_markets(params: Optional[MarketFilterParams] &#x3D; None) -> List[UnifiedMarket]:
```

**Parameters:**

- `params` (MarketFilterParams) - **Optional**: Filter parameters

**Returns:** `List[UnifiedMarket]` - List of unified markets

**Example:**

```python
markets &#x3D; poly.fetch_markets(pmxt.MarketFilterParams(
    limit&#x3D;20,
    sort&#x3D;&#x27;volume&#x27;  # &#x27;volume&#x27; | &#x27;liquidity&#x27; | &#x27;newest&#x27;
))
```


---
### `search_markets`

Search Markets

Search for markets by title or description.

**Signature:**

```python
def search_markets(query: str, params: Optional[MarketFilterParams] &#x3D; None) -> List[UnifiedMarket]:
```

**Parameters:**

- `query` (str): Search query
- `params` (MarketFilterParams) - **Optional**: Filter parameters

**Returns:** `List[UnifiedMarket]` - Search results

**Example:**

```python
results &#x3D; kalshi.search_markets(&#x27;Fed rates&#x27;, pmxt.MarketFilterParams(
    limit&#x3D;10,
    search_in&#x3D;&#x27;title&#x27;  # &#x27;title&#x27; (default) | &#x27;description&#x27; | &#x27;both&#x27;
))
```


---
### `get_markets_by_slug`

Get Market by Slug

Get Market by Slug

**Signature:**

```python
def get_markets_by_slug() -> List[UnifiedMarket]:
```

**Parameters:**

- None

**Returns:** `List[UnifiedMarket]` - Targeted market

**Example:**

```python
# Polymarket: use URL slug
poly_markets &#x3D; poly.get_markets_by_slug(&#x27;who-will-trump-nominate-as-fed-chair&#x27;)

# Kalshi: use market ticker (auto-uppercased)
kalshi_markets &#x3D; kalshi.get_markets_by_slug(&#x27;KXFEDCHAIRNOM-29&#x27;)
```


---
### `fetch_o_h_l_c_v`

Fetch OHLCV Candles

Fetch OHLCV Candles

**Signature:**

```python
def fetch_o_h_l_c_v(id: str, params: Optional[HistoryFilterParams] &#x3D; None) -> List[PriceCandle]:
```

**Parameters:**

- `id` (str): id
- `params` (HistoryFilterParams) - **Optional**: Filter parameters

**Returns:** `List[PriceCandle]` - Historical prices

**Example:**

```python
markets &#x3D; poly.search_markets(&#x27;Trump&#x27;)
outcome_id &#x3D; markets[0].outcomes[0].id  # Get the outcome ID

candles &#x3D; poly.fetch_ohlcv(outcome_id, pmxt.HistoryFilterParams(
    resolution&#x3D;&#x27;1h&#x27;,  # &#x27;1m&#x27; | &#x27;5m&#x27; | &#x27;15m&#x27; | &#x27;1h&#x27; | &#x27;6h&#x27; | &#x27;1d&#x27;
    start&#x3D;datetime(2024, 1, 1),
    end&#x3D;datetime(2024, 1, 31),
    limit&#x3D;100
))
```

**Notes:**
**CRITICAL**: Use &#x60;outcome.id&#x60;, not &#x60;market.id&#x60;.
- **Polymarket**: &#x60;outcome.id&#x60; is the CLOB Token ID
- **Kalshi**: &#x60;outcome.id&#x60; is the Market Ticker

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
order_book &#x3D; kalshi.fetch_order_book(&#x27;FED-25JAN&#x27;)
print(f&#x27;Best bid: {order_book.bids[0].price}&#x27;)
print(f&#x27;Best ask: {order_book.asks[0].price}&#x27;)
```


---
### `fetch_trades`

Fetch Trades

Fetch Trades

**Signature:**

```python
def fetch_trades(id: str, params: Optional[HistoryFilterParams] &#x3D; None) -> List[Trade]:
```

**Parameters:**

- `id` (str): id
- `params` (HistoryFilterParams) - **Optional**: Filter parameters

**Returns:** `List[Trade]` - Recent trades

**Example:**

```python
trades &#x3D; kalshi.fetch_trades(&#x27;FED-25JAN&#x27;, pmxt.HistoryFilterParams(
    resolution&#x3D;&#x27;1h&#x27;,
    limit&#x3D;100
))
```

**Notes:**
**Note**: Polymarket requires API key. Use &#x60;fetchOHLCV&#x60; for public historical data.

---
### `watch_order_book`

Watch Order Book (WebSocket Stream)

Subscribe to real-time order book updates via WebSocket. Returns a promise that resolves with the next order book update. Call repeatedly in a loop to stream updates (CCXT Pro pattern).


**Signature:**

```python
def watch_order_book(outcome_id: str, limit: Optional[Any] &#x3D; None) -> OrderBook:
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
def watch_trades(outcome_id: str, since: Optional[Any] &#x3D; None, limit: Optional[Any] &#x3D; None) -> List[Trade]:
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
### `create_order`

Create Order

Create Order

**Signature:**

```python
def create_order(params: Optional[CreateOrderParams] &#x3D; None) -> Order:
```

**Parameters:**

- `params` (CreateOrderParams) - **Optional**: Filter parameters

**Returns:** `Order` - Order created

**Example:**

```python
# Limit Order Example
order &#x3D; poly.create_order(pmxt.CreateOrderParams(
    market_id&#x3D;&#x27;663583&#x27;,
    outcome_id&#x3D;&#x27;109918492287...&#x27;,
    side&#x3D;&#x27;buy&#x27;,
    type&#x3D;&#x27;limit&#x27;,
    amount&#x3D;10,        # Number of contracts
    price&#x3D;0.55        # Required for limit orders (0.0-1.0)
))

print(f&#x27;Order {order.id}: {order.status}&#x27;)

# Market Order Example
order &#x3D; kalshi.create_order(pmxt.CreateOrderParams(
    market_id&#x3D;&#x27;FED-25JAN&#x27;,
    outcome_id&#x3D;&#x27;FED-25JAN-YES&#x27;,
    side&#x3D;&#x27;sell&#x27;,
    type&#x3D;&#x27;market&#x27;,
    amount&#x3D;5          # Price not needed for market orders
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
cancelled_order &#x3D; poly.cancel_order(&#x27;order-123&#x27;)
print(cancelled_order.status) # &#x27;cancelled&#x27;
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
order &#x3D; kalshi.fetch_order(&#x27;order-456&#x27;)
print(f&#x27;Filled: {order.filled}/{order.amount}&#x27;)
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
all_orders &#x3D; poly.fetch_open_orders()

# Open orders for specific market
market_orders &#x3D; kalshi.fetch_open_orders(&#x27;FED-25JAN&#x27;)

for order in all_orders:
    print(f&#x27;{order.side} {order.amount} @ {order.price}&#x27;)
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
positions &#x3D; kalshi.fetch_positions()
for pos in positions:
    print(f&quot;{pos.outcome_label}: {pos.size} @ ${pos.entry_price}&quot;)
    print(f&quot;Unrealized P&amp;L: ${pos.unrealized_pnl}&quot;)
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
balances &#x3D; poly.fetch_balance()
print(balances)
# [Balance(currency&#x3D;&#x27;USDC&#x27;, total&#x3D;1000, available&#x3D;950, locked&#x3D;50)]
```


---

## Complete Trading Workflow

```python
import pmxt
import os

exchange &#x3D; pmxt.Polymarket(
    private_key&#x3D;os.getenv(&#x27;POLYMARKET_PRIVATE_KEY&#x27;)
)

# 1. Check balance
balances &#x3D; exchange.fetch_balance()
if balances:
    balance &#x3D; balances[0]
    print(f&#x27;Available: ${balance.available}&#x27;)

# 2. Search for a market
markets &#x3D; exchange.search_markets(&#x27;Trump&#x27;)
market &#x3D; markets[0]
outcome &#x3D; market.outcomes[0]

# 3. Place a limit order
order &#x3D; exchange.create_order(pmxt.CreateOrderParams(
    market_id&#x3D;market.id,
    outcome_id&#x3D;outcome.id,
    side&#x3D;&#x27;buy&#x27;,
    type&#x3D;&#x27;limit&#x27;,
    amount&#x3D;10,
    price&#x3D;0.50
))

print(f&#x27;Order placed: {order.id}&#x27;)

# 4. Check order status
updated_order &#x3D; exchange.fetch_order(order.id)
print(f&#x27;Status: {updated_order.status}&#x27;)
print(f&#x27;Filled: {updated_order.filled}/{updated_order.amount}&#x27;)

# 5. Cancel if needed
if updated_order.status &#x3D;&#x3D; &#x27;open&#x27;:
    exchange.cancel_order(order.id)
    print(&#x27;Order cancelled&#x27;)

# 6. Check positions
positions &#x3D; exchange.fetch_positions()
for pos in positions:
    pnl_sign &#x3D; &#x27;+&#x27; if pos.unrealized_pnl &gt; 0 else &#x27;&#x27;
    print(f&#x27;{pos.outcome_label}: {pnl_sign}${pos.unrealized_pnl:.2f}&#x27;)
```

## Data Models

### `UnifiedMarket`



```python
@dataclass
class UnifiedMarket:
id: str # 
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
yes: MarketOutcome # Convenience access to Yes outcome
no: MarketOutcome # Convenience access to No outcome
up: MarketOutcome # Alias for .yes (used for Up/Down markets)
down: MarketOutcome # Alias for .no (used for Up/Down markets)
```

**Binary Outcome Mapping Logic:**

PMXT automatically identifies binary outcomes for markets with exactly two outcomes using the following priority:
1. **Explicit Labels**: Matches "Yes", "Up", or "Over".
2. **Opposite Pattern**: Matches pairs like "Kevin Warsh" and "Not Kevin Warsh", identifying the non-"Not" side as `yes`.
3. **Fallback**: If no pattern is matched, index 0 is mapped to `yes/up` and index 1 to `no/down`.

---
### `MarketOutcome`



```python
@dataclass
class MarketOutcome:
id: str # 
label: str # 
price: float # 
price_change24h: float # 
metadata: object # Exchange-specific metadata (e.g., clobTokenId for Polymarket)
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
### `ExchangeCredentials`

Optional authentication credentials for exchange operations

```python
@dataclass
class ExchangeCredentials:
api_key: str # API key for the exchange
private_key: str # Private key for signing transactions
api_secret: str # API secret (if required by exchange)
passphrase: str # Passphrase (if required by exchange)
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
```

---
