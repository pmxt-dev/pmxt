# pmxt [![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=The%20ccxt%20for%20prediction%20markets.&url=https://github.com/pmxt-dev/pmxt&hashtags=predictionmarkets,trading)

**The ccxt for prediction markets.** A unified API for accessing prediction market data across multiple exchanges.

<img width="3840" height="2160" alt="plot" src="https://github.com/user-attachments/assets/ed77d244-c95f-4fe0-a7a7-89af713c053f" />

<div align="center">
<table>
<tr>
<td rowspan="3">
<a href="https://www.producthunt.com/products/ccxt-for-prediction-markets?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-ccxt-for-prediction-markets" target="_blank" rel="noopener noreferrer"><img alt="CCXT for Prediction Markets - A unified API for prediction market data across exchanges. | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1060549&amp;theme=light&amp;t=1768206672608"></a>
</td>
<td>
<img src="https://img.shields.io/github/watchers/pmxt-dev/pmxt?style=social" alt="GitHub watchers">
</td>
<td>
<a href="https://github.com/qoery-com/pmxt"><img src="https://img.shields.io/badge/downloads-13.0k-blue" alt="Total Downloads"></a>
</td>
</tr>
<tr>
<td>
<img src="https://img.shields.io/github/forks/pmxt-dev/pmxt?style=social" alt="GitHub forks">
</td>
<td>
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License"></a>
</td>
</tr>
<tr>
<td>
<a href="https://github.com/pmxt-dev/pmxt/stargazers"><img src="https://img.shields.io/github/stars/pmxt-dev/pmxt?refresh=1" alt="GitHub stars"></a>
</td>
<td>
<a href="https://www.npmjs.com/package/pmxtjs">
  <img src="https://img.shields.io/npm/v/pmxtjs?label=version" alt="version">
</a>
</td>
</tr>
</table>
</div>

<p align="center">
<img src="https://polymarket.com/favicon.ico" alt="Polymarket" width="40" height="40">
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://kalshi.com/favicon.ico" alt="Kalshi" width="40" height="40">
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://manifold.markets/logo.svg" alt="Manifold Markets" width="40" height="40">
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://metaculus.com/favicon.ico" alt="Metaculus" width="40" height="40">
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://predictit.org/favicon.ico" alt="PredictIt" width="40" height="40">
</p>
<p align="center">

<p align="center">
  <a href="https://discord.gg/Pyn252Pg95">
    <img src="https://img.shields.io/discord/1461393765196501015?label=Discord&logo=discord&logoColor=white&style=for-the-badge&color=5865F2" alt="Discord">
  </a>
</p>

## Why pmxt?

Different prediction market platforms have different APIs, data formats, and conventions. pmxt provides a single, consistent interface to work with all of them.

## Installation

Ensure that [`Node.js`](https://nodejs.org) is installed and the `node` command is available on your PATH.

### Python
```bash
pip install pmxt
```

### Node.js
```bash
npm install pmxtjs
```

## Quickstart

Prediction markets are structured in a hierarchy to group related information.

*   **Event**: The broad topic (e.g., *"Who will Trump nominate as Fed Chair?"*)
*   **Market**: A specific tradeable question (e.g., *"Will Trump nominate Kevin Warsh as the next Fed Chair?"*)
*   **Outcome**: The actual share you buy (e.g., *"Yes"* or *"No"*)

### Python
```python
import pmxt

api = pmxt.Polymarket()

# 1. Search for the broad Event
events = api.search_events('Who will Trump nominate as Fed Chair?')
fed_event = events[0]

# 2. Search for the specific Market within that event
warsh = fed_event.search_markets('Kevin Warsh')[0]

print(f"Price: {warsh.yes.price}")
```

### TypeScript
```typescript
import pmxt from 'pmxtjs';

const api = new pmxt.Polymarket();

// 1. Search for the broad Event
const events = await api.searchEvents('Who will Trump nominate as Fed Chair?');
const fedEvent = events[0];

// 2. Search for the specific Market within that event
const warsh = fedEvent.searchMarkets('Kevin Warsh')[0];

console.log(`Price: ${warsh.yes?.price}`);
```

## Supported Exchanges

- Polymarket
- Kalshi

## Trading
pmxt supports unified trading across exchanges.

### Setup
To trade, you must provide your private credentials.

- **Polymarket**: Requires your Polygon Private Key. [View Setup Guide](core/docs/SETUP_POLYMARKET.md)
- **Kalshi**: Requires API Key & Private Key.

### Example (Python)

```python
import pmxt
import os

exchange = pmxt.Polymarket(
    private_key=os.getenv('POLYMARKET_PRIVATE_KEY')
)

# 1. Check Balance
balance = exchange.fetch_balance()
print(f"Available USDC: {balance[0].available}")

# 2. Place an Order
# Use unique outcome IDs from market.outcomes
order = exchange.create_order(
    market_id='market-123',
    outcome_id='outcome-456',
    side='buy',
    type='limit',
    price=0.33,
    amount=100
)
print(f"Order Status: {order.status}")
```

## Documentation

See the [API Reference](https://www.pmxt.dev/docs) for detailed documentation and more examples.

## Examples

Check out the directory for more use cases:

[TypeScript](https://github.com/pmxt-dev/pmxt/tree/main/sdks/typescript/examples) [Python](https://github.com/pmxt-dev/pmxt/tree/main/sdks/python/examples)



[![Stargazers repo roster for @pmxt-dev/pmxt](https://reporoster.com/stars/pmxt-dev/pmxt)](https://github.com/pmxt-dev/pmxt/stargazers)
