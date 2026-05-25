# pmxt [![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=The%20ccxt%20for%20prediction%20markets.&url=https://github.com/pmxt-dev/pmxt&hashtags=predictionmarkets,trading)  [![DOI](https://zenodo.org/badge/1130657894.svg)](https://doi.org/10.5281/zenodo.19111315)


**The [ccxt](https://github.com/ccxt/ccxt) for prediction markets.** A unified, language-agnostic API for accessing prediction market data across multiple exchanges — works from Python, TypeScript, or any HTTP client.


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
<a href="https://github.com/pmxt-dev/pmxt"><img src="https://pmxt-dev.github.io/pmxt-stats/badges/total-downloads.svg" alt="Total Downloads"></a>
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
  <a href="https://discord.gg/Pyn252Pg95">
    <img src="https://img.shields.io/discord/1461393765196501015?label=Discord&logo=discord&logoColor=white&style=for-the-badge&color=5865F2" alt="Discord">
  </a>
</p>

### Supported Exchanges

<p align="center">
  <a href="https://polymarket.com" style="color: inherit; text-decoration: none;"><img src="https://polymarket.com/favicon.ico" alt="Polymarket" width="24" height="24"> <b>Polymarket</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://polymarket.us" style="color: inherit; text-decoration: none;"><img src="https://polymarket.us/favicon.ico" alt="Polymarket US" width="24" height="24"> <b>Polymarket US</b> 🇺🇸</a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://kalshi.com" style="color: inherit; text-decoration: none;"><img src="https://kalshi.com/favicon.ico" alt="Kalshi" width="24" height="24"> <b>Kalshi</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://limitless.exchange" style="color: inherit; text-decoration: none;"><img src="https://limitless.exchange/assets/images/logo.svg" alt="Limitless" width="24" height="24"> <b>Limitless</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://probable.markets" style="color: inherit; text-decoration: none;"><img src="https://developer.probable.markets/logo.svg" alt="Probable" width="100"></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <!-- # The baozi website seems to just show 50:50 odds for everything. Something must be fundamentally broken on their end. -->
  <a href="https://myriad.markets" style="color: inherit; text-decoration: none;"><img src="https://myriad.markets/favicon.ico" alt="Myriad" width="24" height="24"> <b>Myriad</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://opinion.trade" style="color: inherit; text-decoration: none;"><img src="https://app.opinion.trade/assets/apple-splash-2048-2732.jpg" alt="Opinion" width="24" height="24"> <b>Opinion</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.metaculus.com" style="color: inherit; text-decoration: none;"><img src="https://www.metaculus.com/favicon.ico" alt="Metaculus" width="24" height="24"> <b>Metaculus</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://smarkets.com" style="color: inherit; text-decoration: none;"><img src="https://smarkets.com/favicon.ico" alt="Smarkets" width="24" height="24"> <b>Smarkets</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://hyperliquid.xyz" style="color: inherit; text-decoration: none;"><img src="https://pmxt.dev/venues/hyperliquid.png" alt="Hyperliquid" width="24" height="24"> <b>Hyperliquid</b></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://gemini.com" style="color: inherit; text-decoration: none;"><img src="https://pmxt.dev/venues/gemini-titan.png" alt="Gemini Titan" width="24" height="24"> <b>Gemini Titan</b></a>
</p>

[Feature Support & Compliance](core/COMPLIANCE.md).

## Why pmxt?

Different prediction market platforms have different APIs, data formats, and conventions. pmxt provides a single, consistent interface to work with all of them.

- **Language-agnostic.** Python and TypeScript SDKs today, with HTTP access for any other language. No lock-in to a single ecosystem.
- **Open source (MIT).** No API key required, no vendor dependency, no rate-limit business model. Self-host and run locally, or hit our hosted api.
- **Drop-in Dome API replacement.** Automatic codemod (`dome-to-pmxt`) for teams migrating after the Polymarket acquisition.
- **Unified trading, not just data.** Place orders across Polymarket, Kalshi, and Limitless with a single interface.
- **[MCP-native](https://pmxt.dev/mcp).** Use pmxt directly from Claude, Cursor, and other AI agents.
  

## Installation

Ensure that [`Node.js`](https://nodejs.org) (>= 18) is installed and the `node` command is available on your PATH. The Python SDK requires Python >= 3.8.

### Python
```bash
pip install pmxt
```

### Node.js
```bash
npm install pmxtjs
```

### CLI
```bash
npm install -g @pmxt/cli
pmxt polymarket markets --query Trump --limit 5
pmxt polymarket fetchMarkets --query Trump --limit 5
pmxt auth status
```

### Running from Source
```bash
git clone https://github.com/pmxt-dev/pmxt.git
cd pmxt
npm install
npm run dev
```

### MCP (for AI agents)
```bash
npx -y @pmxt/mcp
```
See [@pmxt/mcp](https://github.com/pmxt-dev/pmxt-mcp) for setup with Claude, Cursor, and other MCP-compatible clients.

## Migrating from Dome API

If you're currently using **Dome API**, pmxt is a drop-in replacement with a unified interface for Polymarket and Kalshi.

Check out [pmxt as a Dome API alternative](https://pmxt.dev/dome-api-alternative) for a detailed migration guide, API comparison, and automatic codemod tool (`dome-to-pmxt`) to help you transition your code.

```bash
# Automatically migrate your codebase
npx dome-to-pmxt ./src
```

## Quickstart

Prediction markets are structured in a hierarchy to group related information.

*   **Event**: The broad topic (e.g., *"Who will Trump nominate as Fed Chair?"*)
*   **Market**: A specific tradeable question (e.g., *"Will Trump nominate Kevin Warsh as the next Fed Chair?"*)
*   **Outcome**: The actual share you buy (e.g., *"Yes"* or *"No"*)

### Python
```python
import pmxt

api = pmxt.Exchange()

# 1. Search for the broad Event
events = api.fetch_events(query='Who will Trump nominate as Fed Chair?')
fed_event = events[0]

# 2. Find the specific Market within that event
warsh = fed_event.markets.match('Kevin Warsh')

print(f"Price: {warsh.yes.price}")
```

### TypeScript

> **Note:** Named imports do not work in ESM. Use `import pmxt from 'pmxtjs'` (default import), not `import { Polymarket } from 'pmxtjs'`.

```typescript
import pmxt from 'pmxtjs';

const api = new pmxt.Exchange();

// 1. Search for the broad Event
const events = await api.fetchEvents({ query: 'Who will Trump nominate as Fed Chair?' });
const fedEvent = events[0];

// 2. Find the specific Market within that event
const warsh = fedEvent.markets.match('Kevin Warsh');

console.log(`Price: ${warsh.yes?.price}`);
```

## Trading
pmxt supports unified trading across exchanges.

### Setup
To trade, you must provide your private credentials during initialization. For detailed credential setup instructions, see the exchange-specific guides: [Polymarket](core/docs/SETUP_POLYMARKET.md), [Kalshi](core/docs/SETUP_KALSHI.md), [Limitless](core/docs/SETUP_LIMITLESS.md).

#### Polymarket
```python
exchange = pmxt.Polymarket(
    private_key=os.getenv('POLYMARKET_PRIVATE_KEY'),
    proxy_address=os.getenv('POLYMARKET_PROXY_ADDRESS'), # Optional: For proxy trading
    signature_type='gnosis-safe' # Default
)
```

#### Kalshi
```python
 exchange = pmxt.Kalshi(
    api_key=os.getenv('KALSHI_API_KEY'),
    private_key=os.getenv('KALSHI_PRIVATE_KEY') # RSA Private Key
)
```

#### Limitless
```python
exchange = pmxt.Limitless(
    api_key=os.getenv('LIMITLESS_API_KEY'),
    private_key=os.getenv('LIMITLESS_PRIVATE_KEY') # For order signing (EIP-712)
)
```

### Trading Example (Python)

```python
import pmxt
import os

# Initialize with credentials (e.g., Polymarket)
exchange = pmxt.Polymarket(
    private_key=os.getenv('POLYMARKET_PRIVATE_KEY'),
    proxy_address=os.getenv('POLYMARKET_PROXY_ADDRESS')
)

# 1. Check Balance
balance = exchange.fetch_balance()
print(f"Available balance: {balance[0].available}")

# 2. Fetch markets
markets = exchange.fetch_markets(query='Trump')

# 3. Place an Order (using outcome shorthand)
order = exchange.create_order(
    outcome=markets[0].yes,
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

## Sponsors
<div align="center">
<table>
  <tr>
    <td align="center" width="300" valign="middle">
      <a href="https://nearbase.dev/?utm_source=pmxt&utm_medium=sponsorship">
        <img src="https://nearbase.dev/nearbase.svg" alt="Nearbase" height="40"/>
      </a>
    </td>
    <td align="center" width="300" valign="middle">
      <a href="https://ondb.ai/">
        <img src="https://ondb.ai/images/logo-full-white-text.svg" alt="OnDB.ai" height="40" valign="middle"/>
        <b>OnDB.ai</b>
      </a>
    </td>
  </tr>
</table>
</div>

[![Stargazers repo roster for @pmxt-dev/pmxt](https://reporoster.com/stars/pmxt-dev/pmxt)](https://github.com/pmxt-dev/pmxt/stargazers)
