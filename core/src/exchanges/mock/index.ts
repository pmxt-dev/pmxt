import {
    EventFetchParams,
    MarketFetchParams,
    OHLCVParams,
    PredictionMarketExchange,
    TradesParams,
} from '../../BaseExchange';
import {
    Balance,
    BuiltOrder,
    CreateOrderParams,
    Order,
    OrderBook,
    OrderLevel,
    Position,
    PriceCandle,
    Trade,
    UnifiedEvent,
    UnifiedMarket,
    UserTrade,
} from '../../types';
import { SeededRng } from './seededRng';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number, decimals = 3) => parseFloat(n.toFixed(decimals));
const toTimestamp = (value: Date | string | number | undefined): number | undefined => {
    if (value === undefined) return undefined;
    if (value instanceof Date) return value.getTime();
    const parsed = typeof value === 'number' ? value : new Date(value).getTime();
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid date value: ${String(value)}`);
    }
    return parsed;
};

const CATEGORIES = ['Politics', 'Sports', 'Crypto', 'Finance', 'Science', 'Entertainment', 'Tech', 'World'];
const LOREM = `lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud
exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute
irure dolor reprehenderit voluptate velit esse cillum dolore fugiat nulla
pariatur excepteur sint occaecat cupidatat non proident mollit anim id est
laborum sollicitudin ultricies tellus pellentesque curabitur elementum
hendrerit metus aenean pharetra magna accumsan`.split(/\s+/);
const ADJECTIVES = [
    'rapid', 'quiet', 'major', 'sunny', 'clever', 'brisk', 'gentle', 'fierce', 'distant', 'noble', 'hollow', 'fuzzy',
];
const NOUNS = [
    'event', 'market', 'race', 'trend', 'signal', 'storm', 'ledger', 'summit', 'forum', 'arena', 'harbor', 'vessel',
];
const FIRST_NAMES = ['Alex', 'Jordan', 'Sam', 'Riley', 'Morgan', 'Quinn', 'Avery', 'Parker', 'Drew', 'Sage', 'Jules', 'Remy'];
const LAST_NAMES = ['Nguyen', 'Garcia', 'Patel', 'Silva', 'Berg', 'Wright', 'Choi', 'Diaz', 'Reed', 'Stone', 'Singh', 'Cole'];
const BINARY_TEMPLATES = [
    'Will {name} win the {year} {event}?',
    'Will {country} GDP grow above {pct}% in {year}?',
    'Will {asset} reach ${price}k by end of {year}?',
    'Will {name} be elected {role}?',
    'Will {company} IPO before {month} {year}?',
    'Will {name} announce {product} at {event}?',
    'Will {country} join {org} by {year}?',
    'Will {sport} season start on time in {year}?',
];
const MULTI_TEMPLATES = [
    'Who will win the {year} {event}?',
    'Which party wins the {year} {country} election?',
    'What will {asset} price be at end of {year}?',
];
const CANDIDATES = [
    ['Alice Johnson', 'Bob Smith', 'Carol Williams', 'David Brown'],
    ['Party A', 'Party B', 'Party C', 'Independent'],
    ['Below $50k', '$50k-$100k', '$100k-$150k', 'Above $150k'],
    ['Q1', 'Q2', 'Q3', 'Q4'],
];
const ASSETS = ['BTC', 'ETH', 'SOL', 'Gold'];
const ROLES = ['President', 'CEO', 'Governor', 'Mayor'];
const ORGS = ['NATO', 'EU', 'BRICS', 'G7'];
const SPORTS = ['NFL', 'NBA', 'MLB', 'NHL'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PICK_WORDS: Record<string, string[]> = {
    company: ['Acme', 'Nimbus', 'Vanta', 'Quanta', 'Helio', 'Orbit', 'Vector', 'Prism', 'Axiom', 'Cipher'],
    product: ['Widget', 'Console', 'Platform', 'Suite', 'Cloud', 'Network', 'Stack', 'Engine', 'Hub', 'Node'],
    month: [...MONTHS],
};

function loremWords(r: SeededRng, count: number): string {
    const w: string[] = [];
    for (let i = 0; i < count; i++) w.push(r.pick(LOREM));
    return w.join(' ');
}

const rng = (seed: string) => new SeededRng(seed);

export interface MockExchangeOptions {
    marketCount?: number;
    balance?: number;
    orderLatencyMs?: number;
    limitOrderMode?: 'immediate' | 'resting';
}

export class MockExchange extends PredictionMarketExchange {
    private readonly _marketCount: number;
    private readonly _initialBalance: number;
    private readonly _orderLatencyMs: number;
    private readonly _limitOrderMode: 'immediate' | 'resting';

    private _generatedMarkets?: UnifiedMarket[];
    private _generatedEvents?: UnifiedEvent[];

    private _freeCash: number;
    private _ordSeq = 0;
    private _orders: Map<string, Order> = new Map();
    private _lockedByBuy: Map<string, number> = new Map();
    private _positions: Map<string, Position> = new Map();
    private _myTrades: UserTrade[] = [];

    constructor(options?: MockExchangeOptions) {
        super();
        this._marketCount = options?.marketCount ?? 50;
        this._initialBalance = options?.balance ?? 1000;
        this._freeCash = this._initialBalance;
        this._orderLatencyMs = options?.orderLatencyMs ?? 100;
        this._limitOrderMode = options?.limitOrderMode ?? 'immediate';
    }

    override get name(): string {
        return 'Mock';
    }

    private _locked(): number {
        let s = 0;
        for (const v of this._lockedByBuy.values()) s += v;
        return s;
    }

    private _bookMidPrice(outcomeId: string): number {
        const r = new SeededRng(outcomeId);
        return round(r.float(0.1, 0.9), 3);
    }

    private _generateMarket(seed: string, eventId: string, isBinary: boolean): UnifiedMarket {
        const f = rng(seed);
        const year = new Date().getFullYear() + f.int(0, 2);
        const category = f.pick(CATEGORIES);

        let title: string;
        if (isBinary) {
            const t = f.pick(BINARY_TEMPLATES);
            const country = f.pick(NOUNS) + f.pick(['ia', 'land', 'stan']);
            title = t
                .replace('{name}', `${f.pick(FIRST_NAMES)} ${f.pick(LAST_NAMES)}`)
                .replace('{year}', String(year))
                .replace('{event}', f.pick(NOUNS))
                .replace('{country}', country)
                .replace('{pct}', String(f.int(1, 8)))
                .replace('{asset}', f.pick(ASSETS))
                .replace('{price}', String(f.int(50, 500)))
                .replace('{role}', f.pick(ROLES))
                .replace('{company}', f.pick(PICK_WORDS.company!))
                .replace('{month}', f.pick(MONTHS))
                .replace('{product}', f.pick(PICK_WORDS.product!))
                .replace('{org}', f.pick(ORGS))
                .replace('{sport}', f.pick(SPORTS));
        } else {
            title = f
                .pick(MULTI_TEMPLATES)
                .replace('{name}', `${f.pick(FIRST_NAMES)} ${f.pick(LAST_NAMES)}`)
                .replace('{year}', String(year))
                .replace('{event}', f.pick(NOUNS))
                .replace('{country}', f.pick(NOUNS) + f.pick(['ia', 'land']))
                .replace('{asset}', f.pick(ASSETS));
        }

        const resolutionDate = new Date(Date.now() + f.int(30, 800) * 86_400_000);
        const volume24h = round(f.float(0, 500_000), 2);
        const volume = round(volume24h * f.float(1, 50), 2);
        const liquidity = round(f.float(500, 200_000), 2);
        const openInterest = round(f.float(100, 80_000), 2);
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
        const marketId = `mock-${seed}`;
        const tags = [category.toLowerCase(), String(year)];

        let outcomes: UnifiedMarket['outcomes'];

        if (isBinary) {
            const yesPrice = round(f.float(0.05, 0.95), 3);
            const noPrice = round(1 - yesPrice, 3);
            const yesChange = round(f.float(-0.1, 0.1), 3);
            outcomes = [
                {
                    outcomeId: `${marketId}-yes`,
                    marketId,
                    label: 'Yes',
                    price: yesPrice,
                    priceChange24h: yesChange,
                    metadata: { clobTokenId: `mock-clob-${seed}-yes` },
                },
                {
                    outcomeId: `${marketId}-no`,
                    marketId,
                    label: 'No',
                    price: noPrice,
                    priceChange24h: -yesChange,
                    metadata: { clobTokenId: `mock-clob-${seed}-no` },
                },
            ];
        } else {
            const candidates = f.pick(CANDIDATES);
            const rawPrices = candidates.map(() => f.float(0.05, 0.9));
            const total = rawPrices.reduce((s, p) => s + p, 0);
            outcomes = candidates.map((label, i) => {
                const rawPrice = rawPrices[i];
                if (rawPrice === undefined) throw new Error(`Missing raw price at index ${i}`);
                return {
                    outcomeId: `${marketId}-${i}`,
                    marketId,
                    label,
                    price: round(rawPrice / total, 3),
                    priceChange24h: round(f.float(-0.05, 0.05), 3),
                    metadata: { clobTokenId: `mock-clob-${seed}-${i}` },
                };
            });
        }

        const market: UnifiedMarket = {
            marketId,
            eventId,
            title,
            description: loremWords(f, 20 + f.int(0, 20)),
            slug,
            outcomes,
            resolutionDate,
            volume24h,
            volume,
            liquidity,
            openInterest,
            url: `https://mock.pmxt.dev/market/${slug}`,
            image: `https://picsum.photos/seed/${encodeURIComponent(seed)}/400/200`,
            category,
            tags,
            status: 'active',
            tickSize: 0.01,
            contractAddress: `0xmock${seed.replace(/[^a-z0-9]/gi, '')}`,
            sourceExchange: 'mock',
        };

        if (isBinary) {
            market.yes = outcomes[0];
            market.no = outcomes[1];
        }
        if (!isBinary && outcomes.length === 2) {
            market.up = outcomes[0];
            market.down = outcomes[1];
        }
        return market;
    }

    private _buildMarkets(): UnifiedMarket[] {
        if (this._generatedMarkets) return this._generatedMarkets;
        const markets: UnifiedMarket[] = [];
        for (let i = 0; i < this._marketCount; i++) {
            const isBinary = i % 4 !== 0;
            const eventIdx = Math.floor(i / 3);
            markets.push(this._generateMarket(`m${i}`, `mock-event-${eventIdx}`, isBinary));
        }
        this._generatedMarkets = markets;
        return markets;
    }

    private _buildEvents(): UnifiedEvent[] {
        if (this._generatedEvents) return this._generatedEvents;
        const markets = this._buildMarkets();
        const eventMap = new Map<string, UnifiedMarket[]>();
        for (const m of markets) {
            if (!m.eventId) continue;
            const existing = eventMap.get(m.eventId);
            if (existing) {
                existing.push(m);
            } else {
                eventMap.set(m.eventId, [m]);
            }
        }
        const events: UnifiedEvent[] = [];
        for (const [eventId, eventMarkets] of eventMap) {
            const f = rng(eventId);
            if (eventMarkets.length === 0) continue;
            const first = eventMarkets[0];
            const volume24h = round(eventMarkets.reduce((s, m) => s + m.volume24h, 0), 2);
            const volume = round(eventMarkets.reduce((s, m) => s + (m.volume ?? 0), 0), 2);
            events.push({
                id: eventId,
                title: `Mock Event: ${f.pick(ADJECTIVES)} ${f.pick(NOUNS)}`,
                description: loremWords(f, 18 + f.int(0, 15)),
                slug: eventId,
                markets: eventMarkets,
                volume24h,
                volume,
                url: `https://mock.pmxt.dev/event/${eventId}`,
                image: `https://picsum.photos/seed/${encodeURIComponent(eventId)}/800/400`,
                category: first.category,
                tags: first.tags,
                sourceExchange: 'mock',
            });
        }
        this._generatedEvents = events;
        return events;
    }

    protected override async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        let markets = this._buildMarkets();
        if (params?.query) {
            const q = params.query.toLowerCase();
            markets = markets.filter(m => m.title.toLowerCase().includes(q));
        }
        if (params?.slug) {
            markets = markets.filter(m => m.slug === params.slug);
        }
        if (params?.eventId) {
            markets = markets.filter(m => m.eventId === params.eventId);
        }
        if (params?.marketId) {
            markets = markets.filter(m => m.marketId === params.marketId);
        }
        if (params?.outcomeId) {
            markets = markets.filter(m => m.outcomes.some(o => o.outcomeId === params.outcomeId));
        }
        if (params?.status && params.status !== 'all') {
            markets = markets.filter(m => (m.status ?? 'active') === params.status);
        }
        const sourceExchange = params?.sourceExchange ?? params?.exchange;
        if (sourceExchange) {
            markets = markets.filter(m => m.sourceExchange === sourceExchange);
        }
        const offset = params?.offset ?? 0;
        const limit = params?.limit;
        return limit !== undefined ? markets.slice(offset, offset + limit) : markets.slice(offset);
    }

    protected override async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        let events = this._buildEvents();
        if (params?.query) {
            const q = params.query.toLowerCase();
            events = events.filter(e => e.title.toLowerCase().includes(q));
        }
        if (params?.eventId) {
            events = events.filter(e => e.id === params.eventId);
        }
        if (params?.slug) {
            events = events.filter(e => e.slug === params.slug);
        }
        if (params?.series) {
            events = events.filter(e => e.sourceMetadata?.series === params.series);
        }
        if (params?.status && params.status !== 'all') {
            events = events.filter(e => ((e as { status?: string }).status ?? 'active') === params.status);
        }
        const sourceExchange = params?.sourceExchange ?? params?.exchange;
        if (sourceExchange) {
            events = events.filter(e => e.sourceExchange === sourceExchange);
        }
        const offset = params?.offset ?? 0;
        const limit = params?.limit;
        return limit !== undefined ? events.slice(offset, offset + limit) : events.slice(offset);
    }

    override async fetchOrderBook(id: string, limit?: number, _params?: Record<string, any>): Promise<OrderBook> {
        const resolved = await this.resolveOutcomeAlias(id, _params);
        id = resolved.outcomeId;
        const f = new SeededRng(id);
        const midPrice = round(f.float(0.1, 0.9), 3);
        const spread = round(f.float(0.005, 0.03), 3);
        const depth = limit === undefined ? 8 : Math.max(0, Math.floor(limit));

        const buildLevels = (startPrice: number, direction: 1 | -1, count: number): OrderLevel[] => {
            const levels: OrderLevel[] = [];
            let price = startPrice;
            for (let i = 0; i < count; i++) {
                price = clamp(round(price + direction * f.float(0.002, 0.01), 3), 0.01, 0.99);
                const size = round(f.float(10, 2000), 0);
                levels.push({ price, size });
            }
            return levels;
        };

        const askStart = clamp(round(midPrice + spread / 2, 3), 0.01, 0.99);
        const bidStart = clamp(round(midPrice - spread / 2, 3), 0.01, 0.99);

        return {
            bids: buildLevels(bidStart, -1, depth).sort((a, b) => b.price - a.price),
            asks: buildLevels(askStart, 1, depth).sort((a, b) => a.price - b.price),
            timestamp: Date.now(),
        };
    }

    override async fetchOrderBooks(outcomeIds: string[]): Promise<Record<string, OrderBook>> {
        const books: Record<string, OrderBook> = {};
        for (const outcomeId of outcomeIds) {
            books[outcomeId] = await this.fetchOrderBook(outcomeId);
        }
        return books;
    }

    override async fetchOHLCV(id: string, params: OHLCVParams): Promise<PriceCandle[]> {
        const f = new SeededRng(id);
        const resolutionMs: Record<string, number> = {
            '1m': 60_000,
            '5m': 300_000,
            '15m': 900_000,
            '1h': 3_600_000,
            '6h': 21_600_000,
            '1d': 86_400_000,
        };
        const step = resolutionMs[params.resolution] ?? 3_600_000;
        const limit = params.limit ?? 100;
        const end = toTimestamp(params.end) ?? Date.now();
        const start = toTimestamp(params.start) ?? end - step * limit;
        const candles: PriceCandle[] = [];
        let price = round(f.float(0.2, 0.8), 3);
        let t = start;
        while (t <= end && candles.length < limit) {
            const drift = f.float(-0.03, 0.03);
            const open = clamp(price, 0.01, 0.99);
            const high = clamp(round(open + Math.abs(f.float(0, 0.05)), 3), 0.01, 0.99);
            const low = clamp(round(open - Math.abs(f.float(0, 0.05)), 3), 0.01, 0.99);
            const close = clamp(round(open + drift, 3), 0.01, 0.99);
            const vol = round(f.float(100, 50_000), 2);
            candles.push({ timestamp: t, open, high, low, close, volume: vol });
            price = close;
            t += step;
        }
        return candles;
    }

    override async fetchTrades(id: string, params: TradesParams = {}): Promise<Trade[]> {
        const f = new SeededRng(id);
        const count = f.int(5, 30);
        const trades: Trade[] = [];
        let ts = Date.now() - count * 60_000;
        for (let i = 0; i < count; i++) {
            ts += f.int(5_000, 120_000);
            trades.push({
                id: f.uuid(),
                timestamp: ts,
                price: round(f.float(0.1, 0.9), 3),
                amount: round(f.float(1, 500), 0),
                side: f.pick(['buy', 'sell'] as const),
                outcomeId: id,
            });
        }
        const start = toTimestamp(params.start);
        const end = toTimestamp(params.end);
        const filtered = [...trades]
            .sort((a, b) => b.timestamp - a.timestamp)
            .filter((trade) => start === undefined || trade.timestamp >= start)
            .filter((trade) => end === undefined || trade.timestamp <= end);
        return params.limit === undefined
            ? filtered
            : filtered.slice(0, Math.max(0, Math.floor(params.limit)));
    }

    override async fetchBalance(_address?: string): Promise<Balance[]> {
        const locked = this._locked();
        return [
            {
                currency: 'USDC',
                total: round(this._freeCash + locked, 2),
                available: round(this._freeCash, 2),
                locked: round(locked, 2),
            },
        ];
    }

    override async fetchPositions(_address?: string): Promise<Position[]> {
        return Array.from(this._positions.values());
    }

    private _nextOrderId(f: SeededRng): string {
        this._ordSeq += 1;
        return `mock-order-${this._ordSeq}-${f.alphanumeric(6)}`;
    }

    private _setPosition(
        params: CreateOrderParams,
        price: number,
        sizeDelta: number,
    ): void {
        const posKey = `${params.marketId}:${params.outcomeId}`;
        const existing = this._positions.get(posKey);
        const newSize = (existing ? existing.size : 0) + sizeDelta;

        if (Math.abs(newSize) < 0.001) {
            this._positions.delete(posKey);
            return;
        }

        const markets = this._buildMarkets();
        const market = markets.find(m => m.marketId === params.marketId);
        const outcome = market?.outcomes.find(o => o.outcomeId === params.outcomeId);

        if (existing) {
            // entryPrice became nullable in v2.49 for hosted-mode positions,
            // but the mock exchange always populates it on first fill — fall
            // back to the new fill price if a prior fill somehow left it unset.
            const prevEntry = existing.entryPrice ?? price;
            const epx = prevEntry * existing.size;
            const npx = price * sizeDelta;
            const newEntry = (epx + npx) / newSize;
            const ep = round(newEntry, 4);
            const cur = price;
            this._positions.set(posKey, {
                marketId: params.marketId,
                outcomeId: params.outcomeId,
                outcomeLabel: outcome?.label ?? params.outcomeId,
                size: round(newSize, 4),
                entryPrice: ep,
                currentPrice: cur,
                unrealizedPnL: round((cur - ep) * newSize, 4),
            });
        } else {
            this._positions.set(posKey, {
                marketId: params.marketId,
                outcomeId: params.outcomeId,
                outcomeLabel: outcome?.label ?? params.outcomeId,
                size: round(newSize, 4),
                entryPrice: price,
                currentPrice: price,
                unrealizedPnL: 0,
            });
        }
    }

    private _pushTrade(f: SeededRng, params: CreateOrderParams, orderId: string, price: number, amount: number, ts: number) {
        this._myTrades.push({
            id: f.uuid(),
            timestamp: ts,
            price,
            amount,
            side: params.side,
            outcomeId: params.outcomeId,
            orderId,
        });
    }

    private _applyInstantFill(
        params: CreateOrderParams,
        orderId: string,
        price: number,
        amount: number,
        ts: number,
        f: SeededRng,
    ): Order {
        const cost = price * amount;
        const order: Order = {
            id: orderId,
            marketId: params.marketId,
            outcomeId: params.outcomeId,
            side: params.side,
            type: params.type,
            price,
            amount,
            status: 'filled',
            filled: amount,
            remaining: 0,
            timestamp: ts,
            fee: round(cost * 0.001, 4),
        };
        this._orders.set(orderId, order);

        if (params.side === 'buy') {
            this._freeCash = Math.max(0, this._freeCash - cost);
        } else {
            this._freeCash += cost;
        }
        const sizeChange = params.side === 'buy' ? amount : -amount;
        this._setPosition(params, price, sizeChange);
        this._pushTrade(f, params, orderId, price, amount, ts);
        const filled = this._orders.get(orderId);
        if (!filled) throw new Error(`Order disappeared after fill: ${orderId}`);
        return { ...filled };
    }

    private _placeRestingLimit(params: CreateOrderParams, ts: number, price: number): Order {
        const ro = new SeededRng('oid:' + this._ordSeq);
        const orderId = this._nextOrderId(ro);

        if (params.side === 'buy') {
            const cost = price * params.amount;
            if (this._freeCash < cost) {
                throw new Error('MockExchange: insufficient USDC for resting buy');
            }
            this._freeCash -= cost;
            this._lockedByBuy.set(orderId, cost);
        }

        const order: Order = {
            id: orderId,
            marketId: params.marketId,
            outcomeId: params.outcomeId,
            side: params.side,
            type: 'limit',
            price,
            amount: params.amount,
            status: 'open',
            filled: 0,
            remaining: params.amount,
            timestamp: ts,
            fee: 0,
        };
        this._orders.set(orderId, order);
        return { ...order };
    }

    override async createOrder(params: CreateOrderParams): Promise<Order> {
        if (this._orderLatencyMs > 0) {
            await new Promise(resolve => setTimeout(resolve, this._orderLatencyMs));
        }
        const f = rng(`co:${params.outcomeId}`);
        const ts = Date.now();
        const isResting = this._limitOrderMode === 'resting' && params.type === 'limit';

        const mid = this._bookMidPrice(params.outcomeId);
        const price =
            params.type === 'market' ? mid : (params.price ?? round(f.float(0.1, 0.9), 3));

        if (isResting) {
            return this._placeRestingLimit(params, ts, price);
        }
        const ro = new SeededRng('oid:' + (this._ordSeq + 1));
        const orderId = this._nextOrderId(ro);
        return this._applyInstantFill(params, orderId, price, params.amount, ts, f);
    }

    async fillOrder(orderId: string, amount?: number): Promise<Order> {
        const current = this._orders.get(orderId);
        if (!current) {
            throw new Error(`Order not found: ${orderId}`);
        }
        if (current.status !== 'open' && current.status !== 'pending') {
            throw new Error(`MockExchange#fillOrder: order is ${current.status}`);
        }
        const f = rng(`fill:${orderId}`);
        const rem = current.remaining;
        const fillAmt = amount === undefined ? rem : Math.min(rem, amount);
        if (fillAmt <= 0) {
            return { ...current };
        }

        const p = current.price ?? 0;
        const newFilled = current.filled + fillAmt;
        const newRem = rem - fillAmt;
        const ts = Date.now();
        const fillCost = p * fillAmt;
        const done = newRem < 0.0001;
        const next: Order = {
            ...current,
            status: done ? 'filled' : 'open',
            filled: newFilled,
            remaining: done ? 0 : newRem,
            fee: round(p * newFilled * 0.001, 4),
            timestamp: ts,
        };

        const cp: CreateOrderParams = {
            marketId: current.marketId,
            outcomeId: current.outcomeId,
            side: current.side,
            type: current.type,
            price: p,
            amount: fillAmt,
        };

        if (current.side === 'buy') {
            const lock = this._lockedByBuy.get(orderId) ?? 0;
            const release = fillCost;
            const left = lock - release;
            if (left <= 0.0001) {
                this._lockedByBuy.delete(orderId);
            } else {
                this._lockedByBuy.set(orderId, left);
            }
        } else {
            this._freeCash += fillCost;
        }
        this._setPosition(cp, p, current.side === 'buy' ? fillAmt : -fillAmt);
        this._pushTrade(f, cp, orderId, p, fillAmt, ts);
        this._orders.set(orderId, next);
        const updated = this._orders.get(orderId);
        if (!updated) throw new Error(`Order disappeared after fill: ${orderId}`);
        return { ...updated };
    }

    override async cancelOrder(orderId: string): Promise<Order> {
        const current = this._orders.get(orderId);
        if (!current) {
            throw new Error(`Order not found: ${orderId}`);
        }
        if (current.status !== 'open' && current.status !== 'pending') {
            throw new Error(`Cannot cancel order in status "${current.status}"`);
        }
        const rest = this._lockedByBuy.get(orderId);
        if (rest !== undefined) {
            this._freeCash += rest;
            this._lockedByBuy.delete(orderId);
        }
        const u: Order = { ...current, status: 'canceled', remaining: 0, timestamp: Date.now() };
        this._orders.set(orderId, u);
        return { ...u };
    }

    override async fetchOrder(orderId: string): Promise<Order> {
        const o = this._orders.get(orderId);
        if (!o) throw new Error(`Order not found: ${orderId}`);
        return { ...o };
    }

    override async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        return Array.from(this._orders.values())
            .filter(o => o.status === 'open' || o.status === 'pending')
            .filter(o => marketId === undefined || o.marketId === marketId)
            .map(o => ({ ...o }));
    }

    override async fetchMyTrades(_params?: { outcomeId?: string; marketId?: string }): Promise<UserTrade[]> {
        let trades = [...this._myTrades];
        if (_params?.outcomeId) trades = trades.filter(t => t.outcomeId === _params.outcomeId);
        return trades.sort((a, b) => b.timestamp - a.timestamp);
    }

    override async fetchClosedOrders(): Promise<Order[]> {
        return Array.from(this._orders.values())
            .filter(o => o.status === 'filled' || o.status === 'canceled' || o.status === 'rejected')
            .map(o => ({ ...o }));
    }

    override async fetchAllOrders(): Promise<Order[]> {
        return Array.from(this._orders.values()).map(o => ({ ...o }));
    }

    override async buildOrder(params: CreateOrderParams): Promise<BuiltOrder> {
        return { exchange: this.name, params, raw: params };
    }

    override async submitOrder(built: BuiltOrder): Promise<Order> {
        return this.createOrder(built.params);
    }

    reset(): void {
        this._freeCash = this._initialBalance;
        this._ordSeq = 0;
        this._orders.clear();
        this._lockedByBuy.clear();
        this._positions.clear();
        this._myTrades = [];
    }
}
