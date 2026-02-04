# DefaultApi

All URIs are relative to *http://localhost:3847*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**cancelOrder**](DefaultApi.md#cancelorderoperation) | **POST** /api/{exchange}/cancelOrder | Cancel Order |
| [**close**](DefaultApi.md#close) | **POST** /api/{exchange}/close | Close WebSocket Connections |
| [**createOrder**](DefaultApi.md#createorderoperation) | **POST** /api/{exchange}/createOrder | Create Order |
| [**fetchBalance**](DefaultApi.md#fetchbalance) | **POST** /api/{exchange}/fetchBalance | Fetch Balance |
| [**fetchEvents**](DefaultApi.md#fetcheventsoperation) | **POST** /api/{exchange}/fetchEvents | Fetch Events |
| [**fetchMarkets**](DefaultApi.md#fetchmarketsoperation) | **POST** /api/{exchange}/fetchMarkets | Fetch Markets |
| [**fetchOHLCV**](DefaultApi.md#fetchohlcvoperation) | **POST** /api/{exchange}/fetchOHLCV | Fetch OHLCV Candles |
| [**fetchOpenOrders**](DefaultApi.md#fetchopenordersoperation) | **POST** /api/{exchange}/fetchOpenOrders | Fetch Open Orders |
| [**fetchOrder**](DefaultApi.md#fetchorder) | **POST** /api/{exchange}/fetchOrder | Fetch Order |
| [**fetchOrderBook**](DefaultApi.md#fetchorderbookoperation) | **POST** /api/{exchange}/fetchOrderBook | Fetch Order Book |
| [**fetchPositions**](DefaultApi.md#fetchpositionsoperation) | **POST** /api/{exchange}/fetchPositions | Fetch Positions |
| [**fetchTrades**](DefaultApi.md#fetchtradesoperation) | **POST** /api/{exchange}/fetchTrades | Fetch Trades |
| [**filterEvents**](DefaultApi.md#filtereventsoperation) | **POST** /api/{exchange}/filterEvents | Filter Events |
| [**filterMarkets**](DefaultApi.md#filtermarketsoperation) | **POST** /api/{exchange}/filterMarkets | Filter Markets |
| [**getExecutionPrice**](DefaultApi.md#getexecutionpriceoperation) | **POST** /api/{exchange}/getExecutionPrice | Get Execution Price |
| [**getExecutionPriceDetailed**](DefaultApi.md#getexecutionpricedetailed) | **POST** /api/{exchange}/getExecutionPriceDetailed | Get Detailed Execution Price |
| [**healthCheck**](DefaultApi.md#healthcheck) | **GET** /health | Server Health Check |
| [**watchOrderBook**](DefaultApi.md#watchorderbookoperation) | **POST** /api/{exchange}/watchOrderBook | Watch Order Book (WebSocket Stream) |
| [**watchPrices**](DefaultApi.md#watchpricesoperation) | **POST** /api/{exchange}/watchPrices | Watch Prices (WebSocket Stream) |
| [**watchTrades**](DefaultApi.md#watchtradesoperation) | **POST** /api/{exchange}/watchTrades | Watch Trades (WebSocket Stream) |
| [**watchUserPositions**](DefaultApi.md#watchuserpositionsoperation) | **POST** /api/{exchange}/watchUserPositions | Watch User Positions (WebSocket Stream) |
| [**watchUserTransactions**](DefaultApi.md#watchusertransactions) | **POST** /api/{exchange}/watchUserTransactions | Watch User Transactions (WebSocket Stream) |



## cancelOrder

> CreateOrder200Response cancelOrder(exchange, cancelOrderRequest)

Cancel Order

### Example

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

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **cancelOrderRequest** | [CancelOrderRequest](CancelOrderRequest.md) |  | [Optional] |

### Return type

[**CreateOrder200Response**](CreateOrder200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Order cancelled |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## close

> BaseResponse close(exchange, watchUserPositionsRequest)

Close WebSocket Connections

Close all WebSocket connections and cleanup resources. Call this when you\&#39;re done streaming to properly release connections. 

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { CloseRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // WatchUserPositionsRequest (optional)
    watchUserPositionsRequest: ...,
  } satisfies CloseRequest;

  try {
    const data = await api.close(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **watchUserPositionsRequest** | [WatchUserPositionsRequest](WatchUserPositionsRequest.md) |  | [Optional] |

### Return type

[**BaseResponse**](BaseResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | WebSocket connections closed successfully |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createOrder

> CreateOrder200Response createOrder(exchange, createOrderRequest)

Create Order

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { CreateOrderOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // CreateOrderRequest (optional)
    createOrderRequest: ...,
  } satisfies CreateOrderOperationRequest;

  try {
    const data = await api.createOrder(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **createOrderRequest** | [CreateOrderRequest](CreateOrderRequest.md) |  | [Optional] |

### Return type

[**CreateOrder200Response**](CreateOrder200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Order created |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchBalance

> FetchBalance200Response fetchBalance(exchange, fetchPositionsRequest)

Fetch Balance

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchBalanceRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchPositionsRequest (optional)
    fetchPositionsRequest: ...,
  } satisfies FetchBalanceRequest;

  try {
    const data = await api.fetchBalance(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **fetchPositionsRequest** | [FetchPositionsRequest](FetchPositionsRequest.md) |  | [Optional] |

### Return type

[**FetchBalance200Response**](FetchBalance200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Account balances |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchEvents

> FetchEvents200Response fetchEvents(exchange, fetchEventsRequest)

Fetch Events

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchEventsOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchEventsRequest (optional)
    fetchEventsRequest: ...,
  } satisfies FetchEventsOperationRequest;

  try {
    const data = await api.fetchEvents(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **fetchEventsRequest** | [FetchEventsRequest](FetchEventsRequest.md) |  | [Optional] |

### Return type

[**FetchEvents200Response**](FetchEvents200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of unified events |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchMarkets

> FetchMarkets200Response fetchMarkets(exchange, fetchMarketsRequest)

Fetch Markets

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchMarketsOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchMarketsRequest (optional)
    fetchMarketsRequest: ...,
  } satisfies FetchMarketsOperationRequest;

  try {
    const data = await api.fetchMarkets(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **fetchMarketsRequest** | [FetchMarketsRequest](FetchMarketsRequest.md) |  | [Optional] |

### Return type

[**FetchMarkets200Response**](FetchMarkets200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of unified markets |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchOHLCV

> FetchOHLCV200Response fetchOHLCV(exchange, fetchOHLCVRequest)

Fetch OHLCV Candles

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchOHLCVOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchOHLCVRequest (optional)
    fetchOHLCVRequest: ...,
  } satisfies FetchOHLCVOperationRequest;

  try {
    const data = await api.fetchOHLCV(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **fetchOHLCVRequest** | [FetchOHLCVRequest](FetchOHLCVRequest.md) |  | [Optional] |

### Return type

[**FetchOHLCV200Response**](FetchOHLCV200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Historical prices |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchOpenOrders

> FetchOpenOrders200Response fetchOpenOrders(exchange, fetchOpenOrdersRequest)

Fetch Open Orders

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchOpenOrdersOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchOpenOrdersRequest (optional)
    fetchOpenOrdersRequest: ...,
  } satisfies FetchOpenOrdersOperationRequest;

  try {
    const data = await api.fetchOpenOrders(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **fetchOpenOrdersRequest** | [FetchOpenOrdersRequest](FetchOpenOrdersRequest.md) |  | [Optional] |

### Return type

[**FetchOpenOrders200Response**](FetchOpenOrders200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of open orders |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchOrder

> CreateOrder200Response fetchOrder(exchange, cancelOrderRequest)

Fetch Order

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchOrderRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // CancelOrderRequest (optional)
    cancelOrderRequest: ...,
  } satisfies FetchOrderRequest;

  try {
    const data = await api.fetchOrder(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **cancelOrderRequest** | [CancelOrderRequest](CancelOrderRequest.md) |  | [Optional] |

### Return type

[**CreateOrder200Response**](CreateOrder200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Order details |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchOrderBook

> FetchOrderBook200Response fetchOrderBook(exchange, fetchOrderBookRequest)

Fetch Order Book

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchOrderBookOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchOrderBookRequest (optional)
    fetchOrderBookRequest: ...,
  } satisfies FetchOrderBookOperationRequest;

  try {
    const data = await api.fetchOrderBook(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **fetchOrderBookRequest** | [FetchOrderBookRequest](FetchOrderBookRequest.md) |  | [Optional] |

### Return type

[**FetchOrderBook200Response**](FetchOrderBook200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Current order book |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchPositions

> FetchPositions200Response fetchPositions(exchange, fetchPositionsRequest)

Fetch Positions

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchPositionsOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchPositionsRequest (optional)
    fetchPositionsRequest: ...,
  } satisfies FetchPositionsOperationRequest;

  try {
    const data = await api.fetchPositions(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **fetchPositionsRequest** | [FetchPositionsRequest](FetchPositionsRequest.md) |  | [Optional] |

### Return type

[**FetchPositions200Response**](FetchPositions200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | User positions |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## fetchTrades

> FetchTrades200Response fetchTrades(exchange, fetchTradesRequest)

Fetch Trades

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FetchTradesOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // FetchTradesRequest (optional)
    fetchTradesRequest: ...,
  } satisfies FetchTradesOperationRequest;

  try {
    const data = await api.fetchTrades(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **fetchTradesRequest** | [FetchTradesRequest](FetchTradesRequest.md) |  | [Optional] |

### Return type

[**FetchTrades200Response**](FetchTrades200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Recent trades |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## filterEvents

> FetchEvents200Response filterEvents(exchange, filterEventsRequest)

Filter Events

Filter a list of events by criteria. Can filter by string query, structured criteria object, or custom filter function. 

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FilterEventsOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // FilterEventsRequest (optional)
    filterEventsRequest: ...,
  } satisfies FilterEventsOperationRequest;

  try {
    const data = await api.filterEvents(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **filterEventsRequest** | [FilterEventsRequest](FilterEventsRequest.md) |  | [Optional] |

### Return type

[**FetchEvents200Response**](FetchEvents200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Filtered events |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## filterMarkets

> FetchMarkets200Response filterMarkets(exchange, filterMarketsRequest)

Filter Markets

Filter a list of markets by criteria. Can filter by string query, structured criteria object, or custom filter function. 

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { FilterMarketsOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // FilterMarketsRequest (optional)
    filterMarketsRequest: ...,
  } satisfies FilterMarketsOperationRequest;

  try {
    const data = await api.filterMarkets(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **filterMarketsRequest** | [FilterMarketsRequest](FilterMarketsRequest.md) |  | [Optional] |

### Return type

[**FetchMarkets200Response**](FetchMarkets200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Filtered markets |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getExecutionPrice

> GetExecutionPrice200Response getExecutionPrice(exchange, getExecutionPriceRequest)

Get Execution Price

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { GetExecutionPriceOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // GetExecutionPriceRequest (optional)
    getExecutionPriceRequest: ...,
  } satisfies GetExecutionPriceOperationRequest;

  try {
    const data = await api.getExecutionPrice(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **getExecutionPriceRequest** | [GetExecutionPriceRequest](GetExecutionPriceRequest.md) |  | [Optional] |

### Return type

[**GetExecutionPrice200Response**](GetExecutionPrice200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Average execution price |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getExecutionPriceDetailed

> GetExecutionPriceDetailed200Response getExecutionPriceDetailed(exchange, getExecutionPriceRequest)

Get Detailed Execution Price

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { GetExecutionPriceDetailedRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // GetExecutionPriceRequest (optional)
    getExecutionPriceRequest: ...,
  } satisfies GetExecutionPriceDetailedRequest;

  try {
    const data = await api.getExecutionPriceDetailed(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **getExecutionPriceRequest** | [GetExecutionPriceRequest](GetExecutionPriceRequest.md) |  | [Optional] |

### Return type

[**GetExecutionPriceDetailed200Response**](GetExecutionPriceDetailed200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Detailed execution result |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## healthCheck

> HealthCheck200Response healthCheck()

Server Health Check

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { HealthCheckRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.healthCheck();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**HealthCheck200Response**](HealthCheck200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Server is consistent and running. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## watchOrderBook

> FetchOrderBook200Response watchOrderBook(exchange, watchOrderBookRequest)

Watch Order Book (WebSocket Stream)

Subscribe to real-time order book updates via WebSocket. Returns a promise that resolves with the next order book update. Call repeatedly in a loop to stream updates (CCXT Pro pattern). 

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { WatchOrderBookOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // WatchOrderBookRequest (optional)
    watchOrderBookRequest: ...,
  } satisfies WatchOrderBookOperationRequest;

  try {
    const data = await api.watchOrderBook(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **watchOrderBookRequest** | [WatchOrderBookRequest](WatchOrderBookRequest.md) |  | [Optional] |

### Return type

[**FetchOrderBook200Response**](FetchOrderBook200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Next order book update |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## watchPrices

> BaseResponse watchPrices(exchange, watchPricesRequest)

Watch Prices (WebSocket Stream)

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { WatchPricesOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // WatchPricesRequest (optional)
    watchPricesRequest: ...,
  } satisfies WatchPricesOperationRequest;

  try {
    const data = await api.watchPrices(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **watchPricesRequest** | [WatchPricesRequest](WatchPricesRequest.md) |  | [Optional] |

### Return type

[**BaseResponse**](BaseResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Price update |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## watchTrades

> FetchTrades200Response watchTrades(exchange, watchTradesRequest)

Watch Trades (WebSocket Stream)

Subscribe to real-time trade updates via WebSocket. Returns a promise that resolves with the next trade(s). Call repeatedly in a loop to stream updates (CCXT Pro pattern). 

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { WatchTradesOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // WatchTradesRequest (optional)
    watchTradesRequest: ...,
  } satisfies WatchTradesOperationRequest;

  try {
    const data = await api.watchTrades(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **watchTradesRequest** | [WatchTradesRequest](WatchTradesRequest.md) |  | [Optional] |

### Return type

[**FetchTrades200Response**](FetchTrades200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Next trade update(s) |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## watchUserPositions

> BaseResponse watchUserPositions(exchange, watchUserPositionsRequest)

Watch User Positions (WebSocket Stream)

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { WatchUserPositionsOperationRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // WatchUserPositionsRequest (optional)
    watchUserPositionsRequest: ...,
  } satisfies WatchUserPositionsOperationRequest;

  try {
    const data = await api.watchUserPositions(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **watchUserPositionsRequest** | [WatchUserPositionsRequest](WatchUserPositionsRequest.md) |  | [Optional] |

### Return type

[**BaseResponse**](BaseResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | User position update |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## watchUserTransactions

> BaseResponse watchUserTransactions(exchange, watchUserPositionsRequest)

Watch User Transactions (WebSocket Stream)

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from 'pmxtjs';
import type { WatchUserTransactionsRequest } from 'pmxtjs';

async function example() {
  console.log("🚀 Testing pmxtjs SDK...");
  const api = new DefaultApi();

  const body = {
    // 'polymarket' | 'kalshi' | 'limitless' | The prediction market exchange to target.
    exchange: exchange_example,
    // WatchUserPositionsRequest (optional)
    watchUserPositionsRequest: ...,
  } satisfies WatchUserTransactionsRequest;

  try {
    const data = await api.watchUserTransactions(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **exchange** | `polymarket`, `kalshi`, `limitless` | The prediction market exchange to target. | [Defaults to `undefined`] [Enum: polymarket, kalshi, limitless] |
| **watchUserPositionsRequest** | [WatchUserPositionsRequest](WatchUserPositionsRequest.md) |  | [Optional] |

### Return type

[**BaseResponse**](BaseResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | User transaction update |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

