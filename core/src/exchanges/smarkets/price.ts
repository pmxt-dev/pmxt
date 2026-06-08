/**
 * Smarkets price and quantity conversion utilities.
 *
 * Smarkets uses percentage basis points (0-10000) for prices
 * and 1/10000 GBP units for quantities.
 */

import { toScaledInteger } from '../../utils/decimal-math';

const BASIS_POINTS_SCALE = 10000;

/**
 * Convert Smarkets basis points (0-10000) to probability (0.0-1.0).
 */
export function fromBasisPoints(basisPoints: number): number {
  return basisPoints / BASIS_POINTS_SCALE;
}

/**
 * Convert probability (0.0-1.0) to Smarkets basis points (0-10000).
 */
export function toBasisPoints(probability: number): number {
  return toScaledInteger(probability, BASIS_POINTS_SCALE);
}

/**
 * Convert Smarkets quantity units (1/10000 GBP) to GBP.
 */
export function fromQuantityUnits(units: number): number {
  return units / BASIS_POINTS_SCALE;
}

/**
 * Convert GBP to Smarkets quantity units (1/10000 GBP).
 */
export function toQuantityUnits(gbp: number): number {
  return toScaledInteger(gbp, BASIS_POINTS_SCALE);
}

/**
 * Get the complement probability (for binary markets: No = 1 - Yes).
 */
export function invertProbability(price: number): number {
  return 1 - price;
}
