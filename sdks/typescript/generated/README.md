# pmxtjs@1.0.2

A TypeScript SDK client for the localhost API.

## Usage

First, install the SDK from npm.

```bash
npm install pmxtjs --save
```

Next, try it out.


```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { CancelOrderOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // CancelOrderRequest (optional)
    cancelOrderRequest: ...,
  } satisfies CancelOrderOperationRequest;

  try {
    const data = await api.cancelOrder(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```


## Documentation

### API Endpoints

All URIs are relative to *http://localhost:3847*

| Class | Method | HTTP request | Description
| ----- | ------ | ------------ | -------------
*DefaultApi* | [**cancelOrder**](docs/DefaultApi.md#cancelorderoperation) | **POST** /api/{exchange}/cancelOrder | Cancel Order
*DefaultApi* | [**close**](docs/DefaultApi.md#close) | **POST** /api/{exchange}/close | Close WebSocket Connections
*DefaultApi* | [**createOrder**](docs/DefaultApi.md#createorderoperation) | **POST** /api/{exchange}/createOrder | Create Order
*DefaultApi* | [**fetchBalance**](docs/DefaultApi.md#fetchbalance) | **POST** /api/{exchange}/fetchBalance | Fetch Balance
*DefaultApi* | [**fetchEvents**](docs/DefaultApi.md#fetcheventsoperation) | **POST** /api/{exchange}/fetchEvents | Fetch Events
*DefaultApi* | [**fetchMarkets**](docs/DefaultApi.md#fetchmarketsoperation) | **POST** /api/{exchange}/fetchMarkets | Fetch Markets
*DefaultApi* | [**fetchOHLCV**](docs/DefaultApi.md#fetchohlcvoperation) | **POST** /api/{exchange}/fetchOHLCV | Fetch OHLCV Candles
*DefaultApi* | [**fetchOpenOrders**](docs/DefaultApi.md#fetchopenordersoperation) | **POST** /api/{exchange}/fetchOpenOrders | Fetch Open Orders
*DefaultApi* | [**fetchOrder**](docs/DefaultApi.md#fetchorder) | **POST** /api/{exchange}/fetchOrder | Fetch Order
*DefaultApi* | [**fetchOrderBook**](docs/DefaultApi.md#fetchorderbookoperation) | **POST** /api/{exchange}/fetchOrderBook | Fetch Order Book
*DefaultApi* | [**fetchPositions**](docs/DefaultApi.md#fetchpositionsoperation) | **POST** /api/{exchange}/fetchPositions | Fetch Positions
*DefaultApi* | [**fetchTrades**](docs/DefaultApi.md#fetchtradesoperation) | **POST** /api/{exchange}/fetchTrades | Fetch Trades
*DefaultApi* | [**filterEvents**](docs/DefaultApi.md#filtereventsoperation) | **POST** /api/{exchange}/filterEvents | Filter Events
*DefaultApi* | [**filterMarkets**](docs/DefaultApi.md#filtermarketsoperation) | **POST** /api/{exchange}/filterMarkets | Filter Markets
*DefaultApi* | [**getExecutionPrice**](docs/DefaultApi.md#getexecutionpriceoperation) | **POST** /api/{exchange}/getExecutionPrice | Get Execution Price
*DefaultApi* | [**getExecutionPriceDetailed**](docs/DefaultApi.md#getexecutionpricedetailed) | **POST** /api/{exchange}/getExecutionPriceDetailed | Get Detailed Execution Price
*DefaultApi* | [**healthCheck**](docs/DefaultApi.md#healthcheck) | **GET** /health | Server Health Check
*DefaultApi* | [**watchOrderBook**](docs/DefaultApi.md#watchorderbookoperation) | **POST** /api/{exchange}/watchOrderBook | Watch Order Book (WebSocket Stream)
*DefaultApi* | [**watchPrices**](docs/DefaultApi.md#watchpricesoperation) | **POST** /api/{exchange}/watchPrices | Watch Prices (WebSocket Stream)
*DefaultApi* | [**watchTrades**](docs/DefaultApi.md#watchtradesoperation) | **POST** /api/{exchange}/watchTrades | Watch Trades (WebSocket Stream)
*DefaultApi* | [**watchUserPositions**](docs/DefaultApi.md#watchuserpositionsoperation) | **POST** /api/{exchange}/watchUserPositions | Watch User Positions (WebSocket Stream)
*DefaultApi* | [**watchUserTransactions**](docs/DefaultApi.md#watchusertransactions) | **POST** /api/{exchange}/watchUserTransactions | Watch User Transactions (WebSocket Stream)


### Models

- [Balance](docs/Balance.md)
- [BaseRequest](docs/BaseRequest.md)
- [BaseResponse](docs/BaseResponse.md)
- [CancelOrderRequest](docs/CancelOrderRequest.md)
- [CreateOrder200Response](docs/CreateOrder200Response.md)
- [CreateOrderParams](docs/CreateOrderParams.md)
- [CreateOrderRequest](docs/CreateOrderRequest.md)
- [ErrorDetail](docs/ErrorDetail.md)
- [ErrorResponse](docs/ErrorResponse.md)
- [EventFetchParams](docs/EventFetchParams.md)
- [ExchangeCredentials](docs/ExchangeCredentials.md)
- [ExchangeCredentialsSignatureType](docs/ExchangeCredentialsSignatureType.md)
- [ExecutionPriceResult](docs/ExecutionPriceResult.md)
- [FetchBalance200Response](docs/FetchBalance200Response.md)
- [FetchEvents200Response](docs/FetchEvents200Response.md)
- [FetchEventsRequest](docs/FetchEventsRequest.md)
- [FetchMarkets200Response](docs/FetchMarkets200Response.md)
- [FetchMarketsRequest](docs/FetchMarketsRequest.md)
- [FetchOHLCV200Response](docs/FetchOHLCV200Response.md)
- [FetchOHLCVRequest](docs/FetchOHLCVRequest.md)
- [FetchOHLCVRequestArgsInner](docs/FetchOHLCVRequestArgsInner.md)
- [FetchOpenOrders200Response](docs/FetchOpenOrders200Response.md)
- [FetchOpenOrdersRequest](docs/FetchOpenOrdersRequest.md)
- [FetchOrderBook200Response](docs/FetchOrderBook200Response.md)
- [FetchOrderBookRequest](docs/FetchOrderBookRequest.md)
- [FetchPositions200Response](docs/FetchPositions200Response.md)
- [FetchPositionsRequest](docs/FetchPositionsRequest.md)
- [FetchTrades200Response](docs/FetchTrades200Response.md)
- [FetchTradesRequest](docs/FetchTradesRequest.md)
- [FilterEventsRequest](docs/FilterEventsRequest.md)
- [FilterEventsRequestArgsInner](docs/FilterEventsRequestArgsInner.md)
- [FilterMarketsRequest](docs/FilterMarketsRequest.md)
- [FilterMarketsRequestArgsInner](docs/FilterMarketsRequestArgsInner.md)
- [FilterMarketsRequestArgsInnerOneOf](docs/FilterMarketsRequestArgsInnerOneOf.md)
- [GetExecutionPrice200Response](docs/GetExecutionPrice200Response.md)
- [GetExecutionPriceDetailed200Response](docs/GetExecutionPriceDetailed200Response.md)
- [GetExecutionPriceRequest](docs/GetExecutionPriceRequest.md)
- [GetExecutionPriceRequestArgsInner](docs/GetExecutionPriceRequestArgsInner.md)
- [HealthCheck200Response](docs/HealthCheck200Response.md)
- [HistoryFilterParams](docs/HistoryFilterParams.md)
- [MarketFilterParams](docs/MarketFilterParams.md)
- [MarketOutcome](docs/MarketOutcome.md)
- [Order](docs/Order.md)
- [OrderBook](docs/OrderBook.md)
- [OrderLevel](docs/OrderLevel.md)
- [Position](docs/Position.md)
- [PriceCandle](docs/PriceCandle.md)
- [Trade](docs/Trade.md)
- [UnifiedEvent](docs/UnifiedEvent.md)
- [UnifiedMarket](docs/UnifiedMarket.md)
- [WatchOrderBookRequest](docs/WatchOrderBookRequest.md)
- [WatchOrderBookRequestArgsInner](docs/WatchOrderBookRequestArgsInner.md)
- [WatchPricesRequest](docs/WatchPricesRequest.md)
- [WatchTradesRequest](docs/WatchTradesRequest.md)
- [WatchUserPositionsRequest](docs/WatchUserPositionsRequest.md)

### Authorization

Endpoints do not require authorization.


## About

This TypeScript SDK client supports the [Fetch API](https://fetch.spec.whatwg.org/)
and is automatically generated by the
[OpenAPI Generator](https://openapi-generator.tech) project:

- API version: `0.4.4`
- Package version: `1.0.2`
- Generator version: `7.18.0`
- Build package: `org.openapitools.codegen.languages.TypeScriptFetchClientCodegen`

The generated npm module supports the following:

- Environments
  * Node.js
  * Webpack
  * Browserify
- Language levels
  * ES5 - you must have a Promises/A+ library installed
  * ES6
- Module systems
  * CommonJS
  * ES6 module system


## Development

### Building

To build the TypeScript source code, you need to have Node.js and npm installed.
After cloning the repository, navigate to the project directory and run:

```bash
npm install
npm run build
```

### Publishing

Once you've built the package, you can publish it to npm:

```bash
npm publish
```

## License

[]()
