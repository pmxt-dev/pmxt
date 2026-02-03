export * from './BaseExchange';
export * from './types';
export * from './utils/math';
export * from './errors';
export * from './exchanges/polymarket';
export * from './exchanges/limitless';
export * from './exchanges/kalshi';
export * from './server/app';
export * from './server/utils/port-manager';
export * from './server/utils/lock-file';

import { PolymarketExchange } from './exchanges/polymarket';
import { LimitlessExchange } from './exchanges/limitless';
import { KalshiExchange } from './exchanges/kalshi';

const pmxt = {
    Polymarket: PolymarketExchange,
    Limitless: LimitlessExchange,
    Kalshi: KalshiExchange
};

export const Polymarket = PolymarketExchange;
export const Limitless = LimitlessExchange;
export const Kalshi = KalshiExchange;

export default pmxt;
