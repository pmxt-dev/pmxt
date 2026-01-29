export * from './BaseExchange';
export * from './types';
export * from './utils/math';
export * from './exchanges/polymarket';
export * from './exchanges/kalshi';
export * from './server/app';
export * from './server/utils/port-manager';
export * from './server/utils/lock-file';

import { PolymarketExchange } from './exchanges/polymarket';
import { KalshiExchange } from './exchanges/kalshi';

const pmxt = {
    polymarket: PolymarketExchange,
    kalshi: KalshiExchange,
    Polymarket: PolymarketExchange,
    Kalshi: KalshiExchange
};

export const polymarket = PolymarketExchange;
export const kalshi = KalshiExchange;

export default pmxt;
