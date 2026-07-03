import { OHLCVParams } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, UnifiedSeries, PriceCandle, OrderBook, Trade, UserTrade, Position, Balance, MarketOutcome } from '../../types';
import { IExchangeNormalizer } from '../interfaces';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { buildSourceMetadata } from '../../utils/metadata';
import { fromKalshiCents, invertKalshiUnified } from './price';
import { KalshiRawEvent, KalshiRawMarket, KalshiRawCandlestick, KalshiRawTrade, KalshiRawFill, KalshiRawOrder, KalshiRawPosition, KalshiRawOrderBookFp, KalshiRawSeries } from './fetcher';

// Raw Kalshi fields already promoted to first-class Unified columns — excluded
// from sourceMetadata so we capture only what the unified shape would drop.
const KALSHI_PROMOTED_EVENT_KEYS = [
    'event_ticker', 'title', 'markets', 'category', 'image_url', 'tags',
] as const;

const KALSHI_PROMOTED_SERIES_KEYS = [
    'ticker', 'title', 'tags', 'frequency', 'category',
] as const;

const KALSHI_PROMOTED_MARKET_KEYS = [
    'ticker', 'title', 'rules_primary', 'rules_secondary', 'expiration_time',
    'volume_24h_fp', 'volume_24h', 'volume', 'volume_fp',
    'liquidity_dollars', 'liquidity', 'open_interest_fp', 'open_interest',
    'status', 'last_price_dollars', 'previous_price_dollars',
    'yes_ask_dollars', 'yes_bid_dollars', 'no_ask_dollars', 'no_bid_dollars',
    'response_price_units', 'last_price', 'yes_ask', 'yes_bid',
] as const;

function parseKalshiPrice(value: string | number | undefined, responseUnits?: string): number | undefined {
    if (value == null) return undefined;
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(parsed)) return undefined;
    const normalizedUnits = responseUnits?.toLowerCase();
    return normalizedUnits === 'cent' || normalizedUnits === 'cents' ? parsed / 100 : parsed;
}

export class KalshiNormalizer implements IExchangeNormalizer<KalshiRawEvent, KalshiRawEvent> {

    normalizeMarket(raw: KalshiRawEvent): UnifiedMarket | null {
        // This normalizes a single-market event. For multi-market events, use normalizeMarketsFromEvent.
        if (!raw || !raw.markets || raw.markets.length === 0) return null;
        return this.normalizeRawMarket(raw, raw.markets[0]);
    }

    normalizeMarketsFromEvent(rawEvent: KalshiRawEvent): UnifiedMarket[] {
        const markets = rawEvent.markets || [];
        const results: UnifiedMarket[] = [];
        for (const market of markets) {
            const um = this.normalizeRawMarket(rawEvent, market);
            if (um) results.push(um);
        }
        return results;
    }

    normalizeRawMarket(event: KalshiRawEvent, market: KalshiRawMarket): UnifiedMarket | null {
        if (!market) return null;

        // Kalshi API v2 migrated from cent integers to FixedPointDollars strings.
        // Prefer the _dollars fields; fall back to deprecated cent fields.
        const yesBid = parseKalshiPrice(market.yes_bid_dollars, market.response_price_units);
        const yesAsk = parseKalshiPrice(market.yes_ask_dollars, market.response_price_units);
        const noBid = parseKalshiPrice(market.no_bid_dollars, market.response_price_units);
        const noAsk = parseKalshiPrice(market.no_ask_dollars, market.response_price_units);
        let price = 0;
        if (market.last_price_dollars != null) {
            price = parseKalshiPrice(market.last_price_dollars, market.response_price_units) ?? 0;
        } else if (yesAsk != null && yesBid != null) {
            price = (yesAsk + yesBid) / 2;
        } else if (yesAsk != null) {
            price = yesAsk;
        } else if (market.last_price) {
            price = fromKalshiCents(market.last_price);
        } else if (market.yes_ask && market.yes_bid) {
            price = (fromKalshiCents(market.yes_ask) + fromKalshiCents(market.yes_bid)) / 2;
        } else if (market.yes_ask) {
            price = fromKalshiCents(market.yes_ask);
        }

        const candidateName = this.deriveOutcomeLabel(market);

        let priceChange = 0;
        if (market.previous_price_dollars != null && market.last_price_dollars != null) {
            priceChange = parseFloat(market.last_price_dollars) - parseFloat(market.previous_price_dollars);
        }

        const noPrice = noAsk != null && noBid != null
            ? (noAsk + noBid) / 2
            : noAsk ?? noBid ?? invertKalshiUnified(price);

        const outcomes: MarketOutcome[] = [
            {
                outcomeId: market.ticker,
                marketId: market.ticker,
                label: candidateName || 'Yes',
                price,
                priceChange24h: priceChange,
                metadata: { bid: yesBid, ask: yesAsk },
            },
            {
                outcomeId: `${market.ticker}-NO`,
                marketId: market.ticker,
                label: candidateName ? `Not ${candidateName}` : 'No',
                price: noPrice,
                priceChange24h: -priceChange,
                metadata: { bid: noBid, ask: noAsk },
            },
        ];

        const unifiedTags: string[] = [];
        if (event.category) unifiedTags.push(event.category);
        if (event.tags && Array.isArray(event.tags)) {
            for (const tag of event.tags) {
                if (!unifiedTags.includes(tag)) unifiedTags.push(tag);
            }
        }

        const um = {
            id: market.ticker,
            marketId: market.ticker,
            eventId: event.event_ticker,
            title: this.cleanLabel(market.title) || event.title,
            description: market.rules_primary || market.rules_secondary || '',
            slug: market.ticker,
            outcomes,
            resolutionDate: new Date(market.expiration_time),
            volume24h: parseFloat(market.volume_24h_fp ?? '') || Number(market.volume_24h || market.volume || 0),
            volume: parseFloat(market.volume_fp ?? '') || Number(market.volume || 0),
            liquidity: parseFloat(String(market.liquidity_dollars || market.liquidity || '0')) || 0,
            openInterest: parseFloat(market.open_interest_fp ?? '') || Number(market.open_interest || 0),
            url: `https://kalshi.com/events/${event.event_ticker}`,
            category: event.category,
            tags: unifiedTags,
            status: this.cleanLabel(market.status) || undefined,
            // series_ticker/series_title live on the parent event, not the raw
            // market, and aren't promoted to a column — attach them here so
            // markets are queryable by series. event_ticker is omitted (already
            // promoted to eventId).
            sourceMetadata: buildSourceMetadata(
                market as unknown as Record<string, unknown>,
                KALSHI_PROMOTED_MARKET_KEYS,
                {
                    yes_ask_size_fp: market.yes_ask_size_fp,
                    yes_bid_size_fp: market.yes_bid_size_fp,
                    series_ticker: event.series_ticker,
                    series_title: event.series_title,
                },
            ),
        } as UnifiedMarket;

        addBinaryOutcomes(um);
        return um;
    }

    normalizeEvent(raw: KalshiRawEvent): UnifiedEvent | null {
        if (!raw) return null;

        const markets: UnifiedMarket[] = this.normalizeMarketsFromEvent(raw);

        return {
            id: raw.event_ticker,
            title: this.deriveEventTitle(raw),
            description: this.deriveEventDescription(raw.markets || []),
            slug: raw.event_ticker,
            markets,
            volume24h: markets.reduce((sum, m) => sum + m.volume24h, 0),
            volume: markets.some(m => m.volume !== undefined)
                ? markets.reduce((sum, m) => sum + (m.volume ?? 0), 0)
                : undefined,
            url: `https://kalshi.com/events/${raw.event_ticker}`,
            image: raw.image_url ?? undefined,
            category: raw.category,
            tags: raw.tags || [],
            // Keeps non-promoted event fields (series_ticker, series_title,
            // sub_title, strike_period, ...); raw markets array is promoted.
            sourceMetadata: buildSourceMetadata(
                raw as unknown as Record<string, unknown>,
                KALSHI_PROMOTED_EVENT_KEYS,
            ),
        };
    }

    normalizeSeries(raw: KalshiRawSeries, events?: UnifiedEvent[]): UnifiedSeries {
        return {
            id: raw.ticker,
            ticker: raw.ticker,
            title: (typeof raw.title === 'string' && raw.title.trim()) ? raw.title.trim() : raw.ticker,
            recurrence: (typeof raw.frequency === 'string' && raw.frequency.trim()) ? raw.frequency.trim() : null,
            url: `https://kalshi.com/events?series=${raw.ticker}`,
            events: events ?? undefined,
            sourceMetadata: buildSourceMetadata(
                raw as unknown as Record<string, unknown>,
                KALSHI_PROMOTED_SERIES_KEYS,
            ),
        };
    }

    normalizeOHLCV(rawCandles: KalshiRawCandlestick[], params: OHLCVParams): PriceCandle[] {
        type OhlcField = 'open' | 'high' | 'low' | 'close';

        const candles = rawCandles.map((c) => {
            const p = c.price || {};
            const ask = c.yes_ask || {};
            const bid = c.yes_bid || {};

            /**
             * Kalshi's new candlestick API returns prices as dollar-denominated
             * strings under `*_dollars` fields (e.g. `close_dollars: "0.9700"`).
             * The legacy API returned integer cents under bare fields
             * (e.g. `close: 97`). Prefer dollars when present; fall back to
             * cents (converted via {@link fromKalshiCents}).
             */
            const getVal = (field: OhlcField): number => {
                const dollarsKey = `${field}_dollars` as const;
                const pd = p[dollarsKey];
                const ad = ask[dollarsKey];
                const bd = bid[dollarsKey];
                if (pd != null) return Number(pd);
                if (ad != null && bd != null) {
                    return (Number(ad) + Number(bd)) / 2;
                }

                const pf = p[field];
                const af = ask[field];
                const bf = bid[field];
                if (pf != null) return fromKalshiCents(pf);
                if (af != null && bf != null) {
                    return (fromKalshiCents(af) + fromKalshiCents(bf)) / 2;
                }

                if (p.previous_dollars != null) return Number(p.previous_dollars);
                if (p.previous != null) return fromKalshiCents(p.previous);
                return 0;
            };

            const volume = c.volume_fp != null
                ? parseFloat(c.volume_fp) || 0
                : (c.volume || 0);

            return {
                timestamp: c.end_period_ts * 1000,
                open: getVal('open'),
                high: getVal('high'),
                low: getVal('low'),
                close: getVal('close'),
                volume,
            };
        });

        if (params.limit && candles.length > params.limit) {
            return candles.slice(-params.limit);
        }
        return candles;
    }

    normalizeOrderBook(raw: { orderbook_fp: KalshiRawOrderBookFp }, id: string): OrderBook {
        const data = raw.orderbook_fp;
        const isNoOutcome = id.endsWith('-NO');

        let bids: { price: number; size: number }[];
        let asks: { price: number; size: number }[];

        if (isNoOutcome) {
            bids = (data.no_dollars || []).map((level) => ({
                price: parseFloat(level[0]),
                size: parseFloat(level[1]),
            }));
            asks = (data.yes_dollars || []).map((level) => ({
                price: Math.round((1 - parseFloat(level[0])) * 10000) / 10000,
                size: parseFloat(level[1]),
            }));
        } else {
            bids = (data.yes_dollars || []).map((level) => ({
                price: parseFloat(level[0]),
                size: parseFloat(level[1]),
            }));
            asks = (data.no_dollars || []).map((level) => ({
                price: Math.round((1 - parseFloat(level[0])) * 10000) / 10000,
                size: parseFloat(level[1]),
            }));
        }

        bids.sort((a, b) => b.price - a.price);
        asks.sort((a, b) => a.price - b.price);

        return { bids, asks, timestamp: Date.now() };
    }

    normalizeTrade(raw: KalshiRawTrade, _index: number): Trade {
        // Kalshi API v2 changed field names:
        //   yes_price (cents int) → yes_price_dollars (dollar string)
        //   count (int)           → count_fp (string)
        const price = raw.yes_price_dollars != null
            ? parseFloat(raw.yes_price_dollars)
            : raw.yes_price != null
                ? fromKalshiCents(raw.yes_price)
                : 0;

        const amount = raw.count_fp != null
            ? parseFloat(raw.count_fp)
            : raw.count ?? 0;

        return {
            id: raw.trade_id,
            timestamp: new Date(raw.created_time).getTime(),
            price,
            amount,
            side: raw.taker_side === 'yes' ? 'buy' : 'sell',
        };
    }

    normalizeUserTrade(raw: KalshiRawFill, _index: number): UserTrade {
        const price = raw.yes_price_dollars != null
            ? parseFloat(raw.yes_price_dollars)
            : raw.yes_price != null
                ? fromKalshiCents(raw.yes_price)
                : 0;

        const amount = raw.count_fp != null
            ? parseFloat(raw.count_fp)
            : raw.count ?? 0;

        return {
            id: raw.fill_id,
            timestamp: new Date(raw.created_time).getTime(),
            price,
            amount,
            side: raw.side === 'yes' ? 'buy' as const : 'sell' as const,
            orderId: raw.order_id,
        };
    }

    normalizeOrder(raw: KalshiRawOrder): import('../../types').Order {
        return {
            id: raw.order_id,
            marketId: raw.ticker,
            outcomeId: raw.ticker,
            side: raw.side === 'yes' ? 'buy' : 'sell',
            type: raw.type === 'limit' ? 'limit' : 'market',
            price: raw.yes_price ? raw.yes_price / 100 : undefined,
            amount: raw.count,
            status: this.mapOrderStatus(raw.status),
            filled: raw.count - (raw.remaining_count || 0),
            remaining: raw.remaining_count || 0,
            timestamp: new Date(raw.created_time).getTime(),
        };
    }

    normalizePosition(raw: KalshiRawPosition): Position {
        const absPosition = Math.abs(raw.position);
        const entryPrice = absPosition > 0 ? raw.total_cost / absPosition / 100 : 0;

        return {
            marketId: raw.ticker,
            outcomeId: raw.ticker,
            outcomeLabel: raw.ticker,
            size: raw.position,
            entryPrice,
            currentPrice: raw.market_price ? raw.market_price / 100 : entryPrice,
            unrealizedPnL: raw.market_exposure ? raw.market_exposure / 100 : 0,
            realizedPnL: raw.realized_pnl ? raw.realized_pnl / 100 : 0,
        };
    }

    normalizeBalance(raw: { balance: number; portfolio_value: number }): Balance[] {
        const available = raw.balance / 100;
        const total = raw.portfolio_value / 100;
        return [{
            currency: 'USD',
            total,
            available,
            locked: total - available,
        }];
    }

    // -- Helpers ---------------------------------------------------------------

    private mapOrderStatus(status: string | undefined): 'pending' | 'open' | 'filled' | 'canceled' | 'rejected' {
        switch ((status ?? '').toLowerCase()) {
            case 'resting': return 'open';
            case 'canceled':
            case 'cancelled': return 'canceled';
            case 'executed':
            case 'filled': return 'filled';
            default: return 'open';
        }
    }

    private deriveEventDescription(markets: KalshiRawMarket[]): string {
        const texts = markets
            .map((m) => m.rules_primary)
            .filter((t): t is string => typeof t === 'string' && t.length > 0);

        if (texts.length === 0) return '';
        if (texts.length === 1) return texts[0];

        const templates = new Map<string, number>();
        for (const market of markets) {
            const rawRule = typeof market?.rules_primary === 'string' ? market.rules_primary : '';
            if (!rawRule) continue;

            const candidate = this.deriveOutcomeLabel(market);
            const templated = this.templateRule(rawRule, candidate);
            templates.set(templated, (templates.get(templated) ?? 0) + 1);
        }

        // Only consider templates that actually contain the {x} placeholder so
        // that a rule we failed to template (e.g. candidate name missing) can
        // never win the vote and leak a specific name into the event description.
        if (templates.size > 0) {
            let bestTemplate: string | null = null;
            let bestCount = 0;
            for (const [template, count] of templates.entries()) {
                if (!template.includes('{x}')) continue;
                if (count > bestCount) {
                    bestTemplate = template;
                    bestCount = count;
                }
            }
            if (bestTemplate) return bestTemplate;
        }

        return texts[0];
    }

    private deriveEventTitle(event: KalshiRawEvent): string {
        const rawTitle = this.cleanLabel(event.title) || event.event_ticker;
        const seriesTitle = this.cleanLabel(event.series_title);
        const markets = event.markets || [];

        if (!seriesTitle || !this.shouldUseSeriesTitle(event, markets)) {
            return rawTitle;
        }

        return this.composeSeriesTitle(seriesTitle, this.deriveCommonEventTitle(event, markets));
    }

    private shouldUseSeriesTitle(event: KalshiRawEvent, markets: KalshiRawMarket[]): boolean {
        if (event.mutually_exclusive !== true) return false;
        if (markets.length < 4) return false;

        const rawTitle = this.cleanLabel(event.title);
        if (!rawTitle) return false;

        const titleLooksScoped = /(?:\bvs\.?\b|\bversus\b|:)/i.test(rawTitle);
        if (!titleLooksScoped) return false;

        const candidateLabels = markets
            .map((market) => this.deriveOutcomeLabel(market))
            .filter((label): label is string => label != null && label.length >= 3);

        if (candidateLabels.length < 4) return false;

        const normalizedTitle = this.normalizeTitleText(rawTitle);
        const containedLabels = new Set<string>();

        const addIfContained = (label: string | null | undefined): void => {
            if (!label) return;
            const normalizedLabel = this.normalizeTitleText(label);
            if (normalizedLabel && normalizedTitle.includes(normalizedLabel)) {
                containedLabels.add(normalizedLabel);
            }
        };

        for (const label of candidateLabels) {
            addIfContained(label);
        }

        // Sub-market tickers often carry the outcome's short identifier or
        // abbreviation (e.g. KXUCL-26-PSG for "Paris Saint-Germain"). Title
        // contamination commonly uses these abbreviations ("PSG vs Arsenal")
        // rather than the full outcome label, so count ticker tails as
        // additional candidate matches.
        const tickerPrefix = typeof event.event_ticker === 'string' ? event.event_ticker : '';
        for (const market of markets) {
            const tail = this.extractTickerTail(market.ticker, tickerPrefix);
            if (tail && tail.length >= 3) {
                addIfContained(tail);
            }
        }

        return containedLabels.size >= 2;
    }

    private extractTickerTail(ticker: string | undefined, eventTicker: string): string | null {
        if (typeof ticker !== 'string' || !ticker) return null;
        let tail = ticker;
        if (eventTicker && tail.startsWith(eventTicker)) {
            tail = tail.slice(eventTicker.length);
        }
        // Strip any leading separators left over from the event_ticker prefix
        // and take the last dash-separated segment as the outcome identifier.
        tail = tail.replace(/^[-_:]+/, '');
        const segments = tail.split(/[-_]/).filter((s) => s.length > 0);
        if (segments.length === 0) return null;
        return segments[segments.length - 1];
    }

    private deriveCommonEventTitle(event: KalshiRawEvent, markets: KalshiRawMarket[]): string | null {
        const eventTitlePrefix = this.extractEventTitlePrefix(event.title);
        if (eventTitlePrefix) {
            if (this.hasWinVerb(eventTitlePrefix)) return 'Winner';
            if (this.hasResolutionTerm(eventTitlePrefix)) return eventTitlePrefix;
        }

        const candidates = new Map<string, number>();

        for (const market of markets) {
            const marketTitle = this.cleanLabel(market.title);
            if (!marketTitle) continue;

            const outcomeLabel = this.deriveOutcomeLabel(market);
            const candidate = this.extractEventTitleFromMarketTitle(marketTitle, outcomeLabel);
            if (!candidate) continue;

            candidates.set(candidate, (candidates.get(candidate) ?? 0) + 1);
        }

        let best: string | null = null;
        let bestCount = 0;
        for (const [candidate, count] of candidates.entries()) {
            if (count > bestCount) {
                best = candidate;
                bestCount = count;
            }
        }

        return best;
    }

    private extractEventTitleFromMarketTitle(title: string, outcomeLabel: string | null): string | null {
        const escapedOutcome = outcomeLabel ? this.escapeRegExp(outcomeLabel) : '[^?]+?';
        const winPattern = new RegExp(`^Will (?:the )?${escapedOutcome} win (?:the )?(.+?)\\??$`, 'i');
        const winMatch = title.match(winPattern);
        if (winMatch?.[1]) {
            return this.ensureWinnerTitle(winMatch[1].trim());
        }

        const plainWinnerMatch = title.match(/^(.+? Winner)\??$/i);
        if (plainWinnerMatch?.[1]) return plainWinnerMatch[1].trim();

        const championMatch = title.match(/^(.+? Champion(?:ship)?)\??$/i);
        if (championMatch?.[1]) return championMatch[1].trim();

        return null;
    }

    private composeSeriesTitle(seriesTitle: string, commonTitle: string | null): string {
        if (!commonTitle) return seriesTitle;

        let title = seriesTitle;
        const year = commonTitle.match(/^\s*(20\d{2})\b/)?.[1];
        if (year && !new RegExp(`\\b${year}\\b`).test(title)) {
            title = `${year} ${title}`;
        }

        if (this.hasResolutionTerm(title)) {
            return title;
        }

        const resolutionTerm = this.extractResolutionTerm(commonTitle);
        if (resolutionTerm) {
            return `${title} ${resolutionTerm}`;
        }

        return title;
    }

    private ensureWinnerTitle(title: string): string {
        if (this.hasResolutionTerm(title)) return title;
        return `${title} Winner`;
    }

    private hasResolutionTerm(title: string): boolean {
        return /\b(winner|champion|championship|nominee|nomination|election|finals?|cup|award)\b/i.test(title);
    }

    private extractEventTitlePrefix(title: string): string | null {
        const match = title.match(/^(.+?)(?:\s*:\s*|\s+[-\u2013\u2014]\s+)(.+)$/u);
        const prefix = match?.[1]?.trim();
        if (prefix && this.normalizeTitleText(prefix) === 'series winner') return null;
        return prefix || null;
    }

    private extractResolutionTerm(title: string): string | null {
        const match = title.match(/\b(Winner|Champion|Championship|Nominee|Nomination|Election|Finals?|Cup|Award)\b\s*$/i);
        return match?.[1] || null;
    }

    private hasWinVerb(title: string): boolean {
        return /\bwin(?:s|ning)?\b/i.test(title);
    }

    private normalizeTitleText(value: string): string {
        return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    }

    private escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private deriveOutcomeLabel(market: KalshiRawMarket): string | null {
        const yesSubtitle = this.cleanLabel(market.yes_sub_title);
        if (yesSubtitle) return yesSubtitle;

        const subtitle = this.cleanLabel(market.subtitle);
        if (subtitle) return subtitle;

        return null;
    }

    private cleanLabel(value: unknown): string | null {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        // Some Kalshi markets use structural subtitles like ":: Democratic".
        if (trimmed.startsWith('::')) return null;
        return trimmed;
    }

    private templateRule(rule: string, candidateName: string | null): string {
        if (!candidateName) return rule;
        const escaped = candidateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Unicode-aware word boundaries so non-ASCII candidate names (Jose,
        // Muller, O'Brien, etc.) still template correctly. JavaScript's \b is
        // ASCII-only and would silently fail on such names.
        const matcher = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu');
        const replaced = rule.replace(matcher, '{x}');
        return replaced === rule ? rule : replaced;
    }
}

// -- Event sorting utility (exported for fetchEvents) -------------------------

function eventVolume(event: KalshiRawEvent): number {
    return (event.markets || []).reduce((sum: number, m: KalshiRawMarket) => sum + (parseFloat(m.volume_fp ?? '') || Number(m.volume || 0)), 0);
}

function eventLiquidity(event: KalshiRawEvent): number {
    return (event.markets || []).reduce((sum: number, m: KalshiRawMarket) => sum + (parseFloat(m.open_interest_fp ?? '') || parseFloat(String(m.liquidity_dollars || m.open_interest || m.liquidity || '0')) || 0), 0);
}

function eventNewest(event: KalshiRawEvent): number {
    const times = (event.markets || [])
        .map((m: KalshiRawMarket) => (m.close_time ? new Date(m.close_time).getTime() : 0))
        .filter((t: number) => t > 0);
    return times.length > 0 ? Math.min(...times) : 0;
}

export function sortRawEvents(events: KalshiRawEvent[], sort: string): KalshiRawEvent[] {
    const copy = [...events];
    if (sort === 'newest') {
        copy.sort((a, b) => eventNewest(b) - eventNewest(a));
    } else if (sort === 'liquidity') {
        copy.sort((a, b) => eventLiquidity(b) - eventLiquidity(a));
    } else {
        copy.sort((a, b) => eventVolume(b) - eventVolume(a));
    }
    return copy;
}
