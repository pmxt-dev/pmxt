import type { OrderIntent, Amount } from 'polymarket-us';
import { complementDecimal, roundToTickDecimal } from '../../utils/decimal-math';

/**
 * Polymarket US price/quantity conversion utilities.
 *
 * CRITICAL CONVENTION: Polymarket US uses a LONG-SIDE PRICE convention.
 * The `price.value` field on every order is ALWAYS the YES-side (long)
 * price between $0.01 and $0.99 - even for orders on the NO side.
 *
 * To express "I want NO at $0.40", you submit a long-side price of
 * `1.00 - 0.40 = $0.60`.
 *
 * This module exposes pure helpers to convert between user-facing
 * side prices and the long-side prices the API expects.
 */

export const POLYMARKET_US_MIN_PRICE = 0.01;
export const POLYMARKET_US_MAX_PRICE = 0.99;
/**
 * Default minimum price increment for Polymarket US markets. Observed live
 * markets report `orderPriceMinTickSize: 0.001`, so we default to that.
 * Per-market overrides (surfaced on `UnifiedMarket.tickSize`) should be
 * preferred when available.
 */
export const POLYMARKET_US_TICK_SIZE = 0.001;
/**
 * Number of decimal places used when serializing `Amount.value` strings.
 * Matches the 0.001 tick-size precision observed on the live gateway
 * (e.g. `"0.864"`, `"0.999"`).
 */
export const POLYMARKET_US_PRICE_DECIMALS = 3;
export const POLYMARKET_US_CURRENCY: 'USD' = 'USD';

const LONG_INTENTS: ReadonlySet<OrderIntent> = new Set<OrderIntent>([
  'ORDER_INTENT_BUY_LONG',
  'ORDER_INTENT_SELL_LONG',
]);

/**
 * Round a price to a tick size using decimal string arithmetic. Defaults to the
 * Polymarket US tick size (0.001) but accepts a per-market override.
 *
 * Note: this is a pure rounding helper - it does NOT validate bounds.
 * Out-of-range inputs (e.g. 0.9999 -> 1.000) will pass through unchanged.
 */
export function roundToTickSize(
  price: number,
  tickSize: number = POLYMARKET_US_TICK_SIZE,
): number {
  return roundToTickDecimal(price, tickSize, POLYMARKET_US_PRICE_DECIMALS);
}

/**
 * Validate a price is finite and within [POLYMARKET_US_MIN_PRICE, POLYMARKET_US_MAX_PRICE].
 *
 * @throws RangeError if price is not finite or out of bounds.
 */
export function validatePriceBounds(price: number): void {
  if (!Number.isFinite(price)) {
    throw new RangeError(
      `Polymarket US price must be a finite number, got: ${price}`,
    );
  }
  if (price < POLYMARKET_US_MIN_PRICE || price > POLYMARKET_US_MAX_PRICE) {
    throw new RangeError(
      `Polymarket US price ${price} is out of bounds [${POLYMARKET_US_MIN_PRICE}, ${POLYMARKET_US_MAX_PRICE}]`,
    );
  }
}

/**
 * Convert a user-supplied price (in their natural side, 0.01-0.99) to the
 * long-side price required by the Polymarket US API.
 *
 * For LONG intents (BUY_LONG, SELL_LONG) the user price is already the
 * long-side price and is returned unchanged.
 *
 * For SHORT intents (BUY_SHORT, SELL_SHORT) the long-side price is
 * `1 - userPrice`.
 *
 * Both the input and the resulting long-side output are validated against
 * the Polymarket US price bounds.
 *
 * @throws RangeError if userPrice (or the derived long-side price) is not
 *   finite or outside [0.01, 0.99].
 */
export function toLongSidePrice(intent: OrderIntent, userPrice: number): number {
  validatePriceBounds(userPrice);
  if (LONG_INTENTS.has(intent)) {
    return userPrice;
  }
  const longPrice = complementDecimal(userPrice, POLYMARKET_US_PRICE_DECIMALS);
  validatePriceBounds(longPrice);
  return longPrice;
}

/**
 * Inverse of `toLongSidePrice`. Given a long-side price returned by the API
 * and the order's intent, recover the user-facing side price.
 *
 * For LONG intents the long-side price IS the user price.
 * For SHORT intents the user price is `1 - longPrice`.
 *
 * @throws RangeError if longPrice (or the derived user price) is not finite
 *   or outside [0.01, 0.99].
 */
export function fromLongSidePrice(intent: OrderIntent, longPrice: number): number {
  validatePriceBounds(longPrice);
  if (LONG_INTENTS.has(intent)) {
    return longPrice;
  }
  const userPrice = complementDecimal(longPrice, POLYMARKET_US_PRICE_DECIMALS);
  validatePriceBounds(userPrice);
  return userPrice;
}

/**
 * Build an SDK `Amount` object from a numeric USD price.
 *
 * The price is first rounded to tick size and then validated against the
 * Polymarket US bounds. The resulting value is formatted as a fixed
 * `POLYMARKET_US_PRICE_DECIMALS`-decimal string (e.g. "0.550"), matching
 * the precision the live gateway reports.
 *
 * An optional `tickSize` override allows per-market tick sizes (as
 * surfaced on `UnifiedMarket.tickSize`) to be honoured instead of the
 * default `POLYMARKET_US_TICK_SIZE`.
 *
 * @throws RangeError if the rounded price is out of bounds.
 */
export function toAmount(
  price: number,
  tickSize: number = POLYMARKET_US_TICK_SIZE,
): Amount {
  if (!Number.isFinite(price)) {
    throw new RangeError(
      `Polymarket US price must be a finite number, got: ${price}`,
    );
  }
  const rounded = roundToTickSize(price, tickSize);
  validatePriceBounds(rounded);
  return {
    value: rounded.toFixed(POLYMARKET_US_PRICE_DECIMALS),
    currency: POLYMARKET_US_CURRENCY,
  };
}

/**
 * Parse an SDK `Amount` back to a number. Returns 0 for undefined or empty
 * values; otherwise delegates to `parseFloat`.
 */
export function fromAmount(amount: Amount | undefined): number {
  if (!amount || !amount.value) {
    return 0;
  }
  return parseFloat(amount.value);
}
