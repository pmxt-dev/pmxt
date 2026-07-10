import {
    UnifiedMarket, UnifiedEvent, MarketOutcome, PriceCandle, OrderBook,
    Trade, UserTrade, Position, Balance, CandleInterval,
} from '../../types';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { buildSourceMetadata } from '../../utils/metadata';
import {
    RainMarketWithDetails, RainRawMarketDetails, RainRawPositions,
    RainRawBalance, RainRawPriceHistory, RainRawTransactions, RainRawMarketTransactions,
} from './fetcher';
import {
    priceBigIntToNumber, weiToNumber, mapRainStatus, rainMarketUrl, USDT_DECIMALS, resolveDecimals, bigintsToStrings,
} from './utils';

const PROMOTED_MARKET_KEYS = [
    'id', 'title', 'status', 'contractAddress', 'totalVolume', 'options',
    'totalLiquidity', 'startTime', 'endTime', 'baseToken', 'baseTokenDecimals',
] as const;

const PROMOTED_EVENT_KEYS = ['id', 'title', 'options'] as const;

export class RainNormalizer {

    /**
     * One Rain market with N options -> one UnifiedMarket when N<=2 (binary),
     * or one UnifiedEvent with N synthetic binary UnifiedMarkets when N>2.
     * The list-shape returns UnifiedMarket[]; callers wanting event grouping
     * should call normalizeEvent.
     */
    normalizeMarket(raw: RainMarketWithDetails): UnifiedMarket | null {
        if (!raw?.market) return null;
        const { details } = raw;
        const m = raw.market as any;
        const marketId = (m._id ?? m.id) as string;
        if (!marketId) return null;

        const decimals = resolveDecimals(details?.baseTokenDecimals ?? m.token?.tokenDecimals, USDT_DECIMALS);
        const contractAddress = (details?.contractAddress ?? m.contractAddress) as string | undefined;
        const title = (m.question ?? m.title ?? details?.title ?? '') as string;
        const tags = (m.tags ?? []) as string[];

        // Outcomes: prefer on-chain (details.options with 1e18 currentPrice);
        // fall back to the list-shape options (percentage 0-100).
        const detailOpts = details?.options ?? [];
        const listOpts = (m.options ?? []) as Array<{ choiceIndex: number; optionName: string; percentage?: number }>;

        const outcomes: MarketOutcome[] = detailOpts.length
            ? detailOpts.map((o) => ({
                outcomeId: `rain:${marketId}:${o.choiceIndex}`,
                marketId: `rain:${marketId}`,
                label: o.optionName,
                price: priceBigIntToNumber(o.currentPrice),
            }))
            : listOpts.map((o) => ({
                outcomeId: `rain:${marketId}:${o.choiceIndex}`,
                marketId: `rain:${marketId}`,
                label: o.optionName,
                price: Math.min(1, Math.max(0, Number(o.percentage ?? 0) / 100)),
            }));

        const volume = details?.allFunds != null
            ? weiToNumber(details.allFunds, decimals)
            : Number(m.totalVolumeUSD ?? m.totalVolume ?? 0);
        const liquidity = details?.totalLiquidity != null
            ? weiToNumber(details.totalLiquidity, decimals)
            : Number(m.totalLiquidityUSD ?? m.totalLiquidity ?? 0);

        const endDate = details?.endTime
            ? new Date(Number(details.endTime) * 1000)
            : (m.endDate ? new Date(m.endDate) : undefined);

        const um: UnifiedMarket = {
            marketId: `rain:${marketId}`,
            title,
            description: '',
            outcomes,
            resolutionDate: endDate,
            volume24h: 0,
            volume,
            liquidity,
            url: rainMarketUrl(marketId),
            status: mapRainStatus((m.status ?? details?.status) as string | undefined),
            contractAddress,
            tags,
            sourceMetadata: buildSourceMetadata(
                bigintsToStrings({ ...(details ?? {}), ...m }) as Record<string, unknown>,
                PROMOTED_MARKET_KEYS,
            ),
        };

        addBinaryOutcomes(um);
        return um;
    }

    /**
     * Rain market -> UnifiedEvent. Multi-option markets are expanded into
     * one synthetic binary market per option (matches Myriad/Polymarket pattern
     * so the matching engine can find cross-venue identity matches).
     */
    normalizeEvent(raw: RainMarketWithDetails): UnifiedEvent | null {
        if (!raw?.market) return null;
        const { details } = raw;
        const m = raw.market as any;
        const eventId = (m._id ?? m.id) as string;
        if (!eventId) return null;
        const eventTitle = (m.question ?? m.title ?? details?.title ?? '') as string;

        // Prefer the on-chain options (with 1e18 price + wei totalFunds) when
        // we have details; fall back to the list-shape (percentage 0-100, no
        // per-option fund total).
        type NormOption = { choiceIndex: number; optionName: string; price: number; fundsBase: number | null };
        const decimals = resolveDecimals(details?.baseTokenDecimals ?? m.token?.tokenDecimals, USDT_DECIMALS);
        const options: NormOption[] = details?.options?.length
            ? details.options.map((o) => ({
                choiceIndex: o.choiceIndex,
                optionName: o.optionName,
                price: priceBigIntToNumber(o.currentPrice),
                fundsBase: weiToNumber(o.totalFunds, decimals),
            }))
            : ((m.options ?? []) as Array<{ choiceIndex: number; optionName: string; percentage?: number }>).map((o) => ({
                choiceIndex: o.choiceIndex,
                optionName: o.optionName,
                price: Math.min(1, Math.max(0, Number(o.percentage ?? 0) / 100)),
                fundsBase: null,
            }));

        const markets: UnifiedMarket[] = [];

        const endDate = details?.endTime
            ? new Date(Number(details.endTime) * 1000)
            : (m.endDate ? new Date(m.endDate) : undefined);
        const contractAddress = (details?.contractAddress ?? m.contractAddress) as string | undefined;
        const status = mapRainStatus((m.status ?? details?.status) as string | undefined);
        const tags = (m.tags ?? []) as string[];

        if (options.length <= 2) {
            const um = this.normalizeMarket(raw);
            if (um) markets.push(um);
        } else {
            for (const opt of options) {
                const yesPrice = opt.price;
                const syntheticOutcomes: MarketOutcome[] = [
                    {
                        outcomeId: `rain:${eventId}:${opt.choiceIndex}`,
                        marketId: `rain:${eventId}:${opt.choiceIndex}`,
                        label: opt.optionName,
                        price: yesPrice,
                    },
                    {
                        outcomeId: `rain:${eventId}:${opt.choiceIndex}:no`,
                        marketId: `rain:${eventId}:${opt.choiceIndex}`,
                        label: `Not ${opt.optionName}`,
                        price: Math.max(0, 1 - yesPrice),
                    },
                ];

                const um: UnifiedMarket = {
                    marketId: `rain:${eventId}:${opt.choiceIndex}`,
                    eventId: `rain:${eventId}`,
                    title: `${eventTitle} - ${opt.optionName}`,
                    description: '',
                    outcomes: syntheticOutcomes,
                    resolutionDate: endDate,
                    volume24h: 0,
                    volume: opt.fundsBase ?? 0,
                    liquidity: opt.fundsBase ?? 0,
                    url: rainMarketUrl(eventId),
                    status,
                    contractAddress,
                    tags,
                };
                addBinaryOutcomes(um);
                markets.push(um);
            }
        }

        return {
            id: `rain:${eventId}`,
            title: eventTitle,
            description: '',
            slug: eventId,
            markets,
            volume24h: 0,
            volume: markets.reduce((s, mk) => s + (mk.volume ?? 0), 0),
            url: rainMarketUrl(eventId),
            tags,
            sourceMetadata: buildSourceMetadata(
                { ...(details ?? {}), ...m } as Record<string, unknown>,
                PROMOTED_EVENT_KEYS,
            ),
        };
    }

    /**
     * Single-level emulated book using AMM spot. The plan was to use
     * getMarketLiquidity.firstBuyOrderPrice / firstSellOrderPrice for real
     * top-of-book; left for v2 because it needs an extra on-chain read per
     * call. ponytail: 1-level AMM book is what Myriad ships and matches the
     * router's expectations.
     */
    normalizeOrderBook(raw: RainMarketWithDetails, outcomeId: string): OrderBook {
        const parts = outcomeId.split(':');
        const choiceIndex = parts.length >= 3 ? Number(parts[2]) : NaN;
        const isSyntheticNo = parts.length >= 4 && parts[3] === 'no';

        const options = raw.details?.options ?? [];
        if (!options.length || isNaN(choiceIndex)) {
            return { bids: [], asks: [], timestamp: Date.now() };
        }

        const option = options.find((o) => o.choiceIndex === choiceIndex);
        if (!option) return { bids: [], asks: [], timestamp: Date.now() };

        let price = priceBigIntToNumber(option.currentPrice);
        if (isSyntheticNo) price = Math.max(0, 1 - price);

        const decimals = resolveDecimals(raw.details?.baseTokenDecimals, USDT_DECIMALS);
        const liquidity = raw.details?.totalLiquidity ? weiToNumber(raw.details.totalLiquidity, decimals) : 0;
        const size = liquidity > 0 ? liquidity : 1;

        return {
            bids: [{ price, size }],
            asks: [{ price, size }],
            timestamp: Date.now(),
        };
    }

    normalizeOHLCV(raw: RainRawPriceHistory | null, limit?: number): PriceCandle[] {
        if (!raw?.candles?.length) return [];
        const candles: PriceCandle[] = raw.candles.map((c) => ({
            timestamp: Number(c.timestamp) * 1000,
            open: priceBigIntToNumber(c.open),
            high: priceBigIntToNumber(c.high),
            low: priceBigIntToNumber(c.low),
            close: priceBigIntToNumber(c.close),
            volume: weiToNumber(c.volume),
        }));
        return limit && candles.length > limit ? candles.slice(-limit) : candles;
    }

    /** Map Rain SDK price-history intervals onto PMXT CandleInterval strings. */
    static mapInterval(resolution: CandleInterval): '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' {
        switch (resolution) {
            case '1m': return '1m';
            case '5m': return '5m';
            case '15m': return '15m';
            case '1h': return '1h';
            case '4h': return '4h';
            case '1d': return '1d';
            case '1w': return '1w';
            default: return '1h';
        }
    }

    normalizeMarketTrades(raw: RainRawMarketTransactions | null): Trade[] {
        if (!raw?.transactions?.length) return [];
        return raw.transactions
            .filter((t) => t.type === 'buy' || t.type === 'limit_buy_filled' || t.type === 'limit_sell_filled')
            .map((t, i): Trade => ({
                id: t.transactionHash ?? `${t.blockNumber}-${i}`,
                timestamp: Number(t.timestamp) * 1000,
                price: priceBigIntToNumber(t.price),
                amount: t.optionAmount ? weiToNumber(t.optionAmount) : 0,
                side: t.type === 'buy' || t.type === 'limit_buy_filled' ? 'buy' : 'sell',
            }));
    }

    normalizeUserTrades(raw: RainRawTransactions | null): UserTrade[] {
        if (!raw?.transactions?.length) return [];
        return raw.transactions
            .filter((t) => t.type === 'buy' || t.type === 'limit_buy_filled' || t.type === 'limit_sell_filled')
            .map((t, i): UserTrade => ({
                id: t.transactionHash ?? `${t.blockNumber}-${i}`,
                timestamp: Number(t.timestamp) * 1000,
                price: priceBigIntToNumber(t.price),
                amount: t.optionAmount ? weiToNumber(t.optionAmount) : 0,
                side: t.type === 'buy' || t.type === 'limit_buy_filled' ? 'buy' : 'sell',
            }));
    }

    normalizePositions(raw: RainRawPositions): Position[] {
        const out: Position[] = [];
        for (const m of raw?.markets ?? []) {
            for (const opt of m.options ?? []) {
                const shares = weiToNumber(opt.shares);
                if (shares === 0) continue;
                out.push({
                    marketId: `rain:${m.marketId}`,
                    outcomeId: `rain:${m.marketId}:${opt.choiceIndex}`,
                    outcomeLabel: opt.optionName,
                    size: shares,
                    entryPrice: undefined,
                    currentPrice: priceBigIntToNumber(opt.currentPrice),
                    currentValue: shares * priceBigIntToNumber(opt.currentPrice),
                });
            }
        }
        return out;
    }

    normalizeBalance(raw: RainRawBalance): Balance[] {
        if (!raw?.tokenBalances?.length) return [];
        return raw.tokenBalances.map((b): Balance => ({
            currency: b.symbol,
            total: weiToNumber(b.balance, b.decimals),
            available: weiToNumber(b.balance, b.decimals),
            locked: 0,
        }));
    }

    normalizeMarketDetails(details: RainRawMarketDetails): UnifiedMarket | null {
        return this.normalizeMarket({
            market: {
                id: details.id,
                title: details.title,
                totalVolume: '0',
                status: details.status,
                contractAddress: details.contractAddress,
            } as any,
            details,
        });
    }
}
