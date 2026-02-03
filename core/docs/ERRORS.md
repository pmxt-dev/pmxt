# Error Handling Guide

PMXT implements CCXT-style unified error handling across all exchanges (Polymarket, Kalshi, Limitless). All errors follow a consistent structure with HTTP status codes, error codes, and retry semantics.

## Table of Contents

- [Error Class Hierarchy](#error-class-hierarchy)
- [HTTP Status Code Mappings](#http-status-code-mappings)
- [Error Properties](#error-properties)
- [Usage Examples](#usage-examples)
- [Exchange-Specific Patterns](#exchange-specific-patterns)
- [Migration Guide](#migration-guide)

## Error Class Hierarchy

All PMXT errors extend from `BaseError`, which provides consistent properties across all error types.

### Client Errors (4xx)

#### **BadRequest** (400)
Generic bad request error. Base class for more specific validation errors.

```typescript
import { BadRequest } from 'pmxt';

throw new BadRequest('Invalid parameter', 'Polymarket');
```

#### **AuthenticationError** (401)
Authentication credentials are missing or invalid.

```typescript
import { AuthenticationError } from 'pmxt';

throw new AuthenticationError('Invalid API key', 'Polymarket');
```

#### **PermissionDenied** (403)
The authenticated user doesn't have permission for this operation.

```typescript
import { PermissionDenied } from 'pmxt';

throw new PermissionDenied('Insufficient permissions', 'Kalshi');
```

#### **NotFound** (404)
The requested resource doesn't exist.

```typescript
import { NotFound, OrderNotFound, MarketNotFound } from 'pmxt';

// Generic not found
throw new NotFound('Resource not found', 'Limitless');

// Specific order not found
throw new OrderNotFound('order-123', 'Polymarket');

// Specific market not found
throw new MarketNotFound('market-456', 'Kalshi');
```

#### **RateLimitExceeded** (429)
Rate limit exceeded. This error is retryable and may include `retryAfter` seconds.

```typescript
import { RateLimitExceeded } from 'pmxt';

// With retry-after header
throw new RateLimitExceeded('Too many requests', 60, 'Polymarket');

// Without retry-after
throw new RateLimitExceeded('Rate limit exceeded', undefined, 'Kalshi');
```

#### **InvalidOrder** (400)
Order parameters are invalid (price, size, tick size, etc.).

```typescript
import { InvalidOrder } from 'pmxt';

throw new InvalidOrder('Invalid tick size: must be 0.01', 'Polymarket');
```

#### **InsufficientFunds** (400)
Insufficient funds to complete the operation.

```typescript
import { InsufficientFunds } from 'pmxt';

throw new InsufficientFunds('Insufficient balance: need $100, have $50', 'Kalshi');
```

#### **ValidationError** (400)
Input validation failed. Includes optional `field` property.

```typescript
import { ValidationError } from 'pmxt';

throw new ValidationError('ID cannot be empty', 'id');
```

### Server/Network Errors (5xx)

#### **NetworkError** (503)
Network connectivity issues. This error is retryable.

```typescript
import { NetworkError } from 'pmxt';

throw new NetworkError('Connection timeout', 'Polymarket');
```

#### **ExchangeNotAvailable** (503)
Exchange is down or unreachable. This error is retryable.

```typescript
import { ExchangeNotAvailable } from 'pmxt';

throw new ExchangeNotAvailable('Exchange is temporarily unavailable', 'Limitless');
```

## HTTP Status Code Mappings

| Status Code | Error Class | Retryable | Description |
|------------|-------------|-----------|-------------|
| 400 | `BadRequest` | No | Malformed request or invalid parameters |
| 400 | `InvalidOrder` | No | Order validation failed |
| 400 | `InsufficientFunds` | No | Not enough balance |
| 400 | `ValidationError` | No | Input validation failed |
| 401 | `AuthenticationError` | No | Invalid or missing credentials |
| 403 | `PermissionDenied` | No | Insufficient permissions |
| 404 | `NotFound` | No | Resource not found |
| 404 | `OrderNotFound` | No | Order not found |
| 404 | `MarketNotFound` | No | Market not found |
| 429 | `RateLimitExceeded` | Yes | Too many requests |
| 503 | `NetworkError` | Yes | Network connectivity issues |
| 503 | `ExchangeNotAvailable` | Yes | Exchange down or unreachable |

## Error Properties

All errors extend from `BaseError` and include these properties:

```typescript
interface BaseError {
    message: string;        // Human-readable error message
    status: number;         // HTTP status code
    code: string;           // Machine-readable error code
    retryable: boolean;     // Whether the operation can be retried
    exchange?: string;      // Which exchange threw the error
    name: string;           // Error class name
    stack?: string;         // Stack trace
}
```

Additional properties for specific errors:

- **RateLimitExceeded**: `retryAfter?: number` - Seconds to wait before retrying
- **ValidationError**: `field?: string` - Which field failed validation

## Usage Examples

### Basic Error Handling

```typescript
import { Polymarket, AuthenticationError, InsufficientFunds } from 'pmxt';

const exchange = new Polymarket({ privateKey: '0x...' });

try {
    const order = await exchange.createOrder({
        marketId: 'market-123',
        outcomeId: 'outcome-456',
        side: 'buy',
        type: 'limit',
        price: 0.55,
        amount: 10
    });
} catch (error) {
    if (error instanceof AuthenticationError) {
        console.error('Authentication failed. Check your API credentials.');
    } else if (error instanceof InsufficientFunds) {
        console.error('Not enough balance to place order.');
    } else {
        console.error('Order failed:', error.message);
    }
}
```

### Retry Logic for Retryable Errors

```typescript
import { Polymarket, BaseError, RateLimitExceeded } from 'pmxt';

async function fetchMarketsWithRetry(exchange: Polymarket, maxRetries = 3) {
    let retries = 0;

    while (retries < maxRetries) {
        try {
            return await exchange.fetchMarkets();
        } catch (error) {
            if (error instanceof BaseError && error.retryable) {
                retries++;

                // Handle rate limits with backoff
                if (error instanceof RateLimitExceeded && error.retryAfter) {
                    console.log(`Rate limited. Waiting ${error.retryAfter} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, error.retryAfter! * 1000));
                } else {
                    // Exponential backoff for other retryable errors
                    const delay = Math.pow(2, retries) * 1000;
                    console.log(`Retrying in ${delay}ms... (attempt ${retries}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                continue;
            }

            // Non-retryable error, throw immediately
            throw error;
        }
    }

    throw new Error('Max retries exceeded');
}
```

### Server Response Structure

When using the PMXT server, errors are returned in this format:

```json
{
  "success": false,
  "error": {
    "message": "Insufficient balance: need $100, have $50",
    "code": "INSUFFICIENT_FUNDS",
    "retryable": false,
    "exchange": "Polymarket"
  }
}
```

For rate limit errors:

```json
{
  "success": false,
  "error": {
    "message": "Too many requests",
    "code": "RATE_LIMIT_EXCEEDED",
    "retryable": true,
    "exchange": "Kalshi",
    "retryAfter": 60
  }
}
```

## Exchange-Specific Patterns

### Polymarket

**Authentication errors** (400 response):
- "API key" → `AuthenticationError`
- "proxy" → `AuthenticationError`
- "signature type" → `AuthenticationError`

**Order validation errors**:
- "tick size" → `InvalidOrder`

**Error message location**: `response.data.errorMsg`

### Kalshi

**Balance errors**:
- "balance" → `InsufficientFunds`

**Error message format**: `[status] message` (e.g., "[400] invalid UUID")

**Error message location**: `response.data.error.message`

### Limitless

Uses CLOB client (similar to Polymarket):
- Same authentication patterns
- Same order validation patterns
- Error message location: `response.data.errorMsg`

## Migration Guide

### Before (v1.6.0 and earlier)

```typescript
import { Polymarket } from 'pmxt';

const exchange = new Polymarket({ privateKey: '0x...' });

try {
    const markets = await exchange.fetchMarkets();
    // Empty array returned on error - can't detect failure!
    if (markets.length === 0) {
        console.log('No markets found... or was there an error?');
    }
} catch (error) {
    // Generic Error - can't distinguish error types
    console.error('Something went wrong:', error.message);
}
```

### After (v1.7.0+)

```typescript
import { Polymarket, NetworkError, AuthenticationError, BaseError } from 'pmxt';

const exchange = new Polymarket({ privateKey: '0x...' });

try {
    const markets = await exchange.fetchMarkets();
    // Always returns valid array or throws error
    if (markets.length === 0) {
        console.log('No markets found');
    }
} catch (error) {
    if (error instanceof NetworkError && error.retryable) {
        // Implement retry logic
        console.log('Network error, retrying...');
    } else if (error instanceof AuthenticationError) {
        // Re-authenticate
        console.error('Authentication failed. Check credentials.');
    } else if (error instanceof BaseError) {
        // Handle other PMXT errors
        console.error(`${error.exchange} error [${error.code}]: ${error.message}`);
    } else {
        // Unknown error
        console.error('Unexpected error:', error);
    }
}
```

## Breaking Changes

1. **Error types**: Methods now throw custom error classes instead of generic `Error`
2. **Error messages**: Standardized error messages may differ from previous format
3. **Market data methods**: Now throw errors instead of returning empty arrays on failure
4. **Test assertions**: Tests must check error types and properties instead of just catching generic errors

## Best Practices

1. **Always catch specific error types** when you need different handling logic
2. **Check the `retryable` property** before implementing retry logic
3. **Use the `exchange` property** to log which exchange had the error
4. **Check `error.status`** if you need to map to HTTP responses
5. **Use TypeScript** to get type safety for error handling

## Error Codes Reference

| Code | Error Class | HTTP Status |
|------|-------------|-------------|
| `BAD_REQUEST` | `BadRequest` | 400 |
| `AUTHENTICATION_ERROR` | `AuthenticationError` | 401 |
| `PERMISSION_DENIED` | `PermissionDenied` | 403 |
| `NOT_FOUND` | `NotFound` | 404 |
| `ORDER_NOT_FOUND` | `OrderNotFound` | 404 |
| `MARKET_NOT_FOUND` | `MarketNotFound` | 404 |
| `RATE_LIMIT_EXCEEDED` | `RateLimitExceeded` | 429 |
| `INVALID_ORDER` | `InvalidOrder` | 400 |
| `INSUFFICIENT_FUNDS` | `InsufficientFunds` | 400 |
| `VALIDATION_ERROR` | `ValidationError` | 400 |
| `NETWORK_ERROR` | `NetworkError` | 503 |
| `EXCHANGE_NOT_AVAILABLE` | `ExchangeNotAvailable` | 503 |
