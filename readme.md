# pmxt [![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=The%20ccxt%20for%20prediction%20markets.&url=https://github.com/qoery-com/pmxt&hashtags=predictionmarkets,trading)

**The ccxt for prediction markets.** A unified API for accessing prediction market data across multiple exchanges.

<img width="3840" height="2160" alt="plot" src="https://github.com/user-attachments/assets/ed77d244-c95f-4fe0-a7a7-89af713c053f" />

<div align="center">
<table>
<tr>
<td rowspan="3">
<a href="https://www.producthunt.com/products/ccxt-for-prediction-markets?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-ccxt-for-prediction-markets" target="_blank" rel="noopener noreferrer"><img alt="CCXT for Prediction Markets - A unified API for prediction market data across exchanges. | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1060549&amp;theme=light&amp;t=1768206672608"></a>
</td>
<td>
<img src="https://img.shields.io/github/watchers/qoery-com/pmxt?style=social" alt="GitHub watchers">
</td>
<td>
<a href="https://github.com/qoery-com/pmxt"><img src="https://img.shields.io/badge/downloads-6.3k-blue" alt="Total Downloads"></a>
</td>
</tr>
<tr>
<td>
<img src="https://img.shields.io/github/forks/qoery-com/pmxt?style=social" alt="GitHub forks">
</td>
<td>
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License"></a>
</td>
</tr>
<tr>
<td>
<a href="https://github.com/qoery-com/pmxt/stargazers"><img src="https://img.shields.io/github/stars/qoery-com/pmxt?refresh=1" alt="GitHub stars"></a>
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
    <img src="https://img.shields.io/badge/Discord-%235865F2.svg?style=for-the-badge&logo=discord&logoColor=white" alt="Discord">
  </a>
</p>

## Why pmxt?

Different prediction market platforms have different APIs, data formats, and conventions. pmxt provides a single, consistent interface to work with all of them.

## Quickstart

Get the current price for any market in seconds.

### Python

```python
import pmxt

api = pmxt.Polymarket()
markets = api.get_markets_by_slug('who-will-trump-nominate-as-fed-chair')

warsh = next((m for m in markets if m.outcomes[0].label == 'Kevin Warsh'), None) 

print(warsh.outcomes[0].price) # price of 'Yes' outcome
```

> **Note**: For TypeScript usage, see [pmxtjs documentation](https://pmxt.dev/docs).

## Installation

### Python
```bash
pip install pmxt
```

### Node.js
```bash
npm install pmxtjs
```

## Supported Exchanges

- Polymarket
- Kalshi

## Trading
pmxt supports trading functionality (placing and cancelling orders).

### Setup
To trade, you must provide your private credentials.

- **Polymarket**: Requires your Polygon Private Key. [View Setup Guide](core/docs/SETUP_POLYMARKET.md)
- **Kalshi**: Requires API Key & Private Key.

### Trading Example

```typescript
import pmxt from 'pmxtjs';

const exchange = new pmxt.Polymarket({
    privateKey: process.env.POLYMARKET_PRIVATE_KEY
});

// Check Balance
const balance = await exchange.fetchBalance();
console.log('Balance:', balance);

// Place an Order
const order = await exchange.createOrder({
    marketId: 'market-123',
    outcomeId: 'token-id-456',
    side: 'buy',
    type: 'limit',
    price: 0.50,
    amount: 100
});
console.log('Order:', order);
```

## Documentation

See the [API Reference](https://www.pmxt.dev/docs) for detailed documentation and more examples.

## Examples

Check out the directory for more use cases:

[TypeScript](https://github.com/pmxt-dev/pmxt/tree/main/sdks/typescript/examples) [Python](https://github.com/pmxt-dev/pmxt/tree/main/sdks/python/examples)



[![Stargazers repo roster for @qoery-com/pmxt](https://reporoster.com/stars/qoery-com/pmxt)](https://github.com/qoery-com/pmxt/stargazers)
