# pmxt [![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=The%20ccxt%20for%20prediction%20markets.&url=https://github.com/qoery-com/pmxt&hashtags=predictionmarkets,trading)

**The ccxt for prediction markets.** A unified API for accessing prediction market data across multiple exchanges.

<div align="center">
<table>
<tr>
<td rowspan="3">
<a href="https://www.producthunt.com/products/qoery-python-sdk?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-qoery-python-sdk" target="_blank" rel="noopener noreferrer"><img alt="Qoery Python SDK - 50% cheaper crypto data. Now in Python. | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1056631&amp;theme=light&amp;t=1767263265752"></a>
</td>
<td>
<img src="https://img.shields.io/github/watchers/qoery-com/pmxt?style=social" alt="GitHub watchers">
</td>
<td>
<a href="https://www.npmjs.com/package/pmxtjs"><img src="https://img.shields.io/npm/dt/pmxtjs" alt="Downloads"></a>
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
<!-- Space for future badge -->
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

## Why pmxt?

Different prediction market platforms have different APIs, data formats, and conventions. pmxt provides a single, consistent interface to work with all of them.

## Quick Example

Search for markets across Polymarket and Kalshi using the same API:

```typescript
import { PolymarketExchange, KalshiExchange } from 'pmxtjs';

const query = process.argv[2] || 'Fed';
console.log(`Searching for "${query}"...\n`);

// Polymarket
const polymarket = new PolymarketExchange();
const polyResults = await polymarket.searchMarkets(query, { sort: 'volume' });

console.log(`--- Polymarket Found ${polyResults.length} ---`);
polyResults.slice(0, 10).forEach(m => {
    const label = m.outcomes[0]?.label || 'Unknown';
    console.log(`[${m.id}] ${m.title} - ${label} (Vol24h: $${m.volume24h.toLocaleString()})`);
});

// Kalshi
const kalshi = new KalshiExchange();
const kalshiResults = await kalshi.searchMarkets(query);

console.log(`\n--- Kalshi Found ${kalshiResults.length} ---`);
kalshiResults.slice(0, 10).forEach(m => {
    const label = m.outcomes[0]?.label || 'Unknown';
    console.log(`[${m.id}] ${m.title} - ${label} (Vol24h: $${m.volume24h.toLocaleString()})`);
});
```

## Installation

```bash
npm install pmxtjs
```

## Supported Exchanges

- Polymarket
- Kalshi

## Documentation

See the [API Reference](pmxt/API_REFERENCE.md) for detailed documentation and more examples.

## Examples

Check out the [examples](pmxt/examples/) directory for more use cases:
- Market search
- Order book data
- Historical prices
- Event price tracking
- Recent trades


[![Stargazers repo roster for @qoery-com/pmxt](https://reporoster.com/stars/qoery-com/pmxt)](https://github.com/qoery-com/pmxt/stargazers)
