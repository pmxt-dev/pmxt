# pmxt [![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=The%20ccxt%20for%20prediction%20markets.&url=https://github.com/qoery-com/pmxt&hashtags=predictionmarkets,trading)

**The ccxt for prediction markets.** A unified API for accessing prediction market data across multiple exchanges.

<img width="3840" height="2160" alt="plot" src="https://github.com/user-attachments/assets/ed77d244-c95f-4fe0-a7a7-89af713c053f" />

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

Get the current price for any market in seconds:

```typescript
import pmxt from 'pmxtjs';

async function main() {
  const poly = new pmxt.polymarket();
  const [market] = await poly.searchMarkets('Trump');

  console.log(`${market.title} - ${market.outcomes[0].label}: ${marketoutcomes[0].price * 100}%`);
}

main();
```

## Installation

```bash
npm install pmxtjs
```

## Supported Exchanges

- Polymarket
- Kalshi

## Documentation

See the [API Reference](API_REFERENCE.md) for detailed documentation and more examples.

## Examples

Check out the [examples](examples/) directory for more use cases:
- Market search
- Order book data
- Historical prices
- Event price tracking
- Recent trades


[![Stargazers repo roster for @qoery-com/pmxt](https://reporoster.com/stars/qoery-com/pmxt)](https://github.com/qoery-com/pmxt/stargazers)
