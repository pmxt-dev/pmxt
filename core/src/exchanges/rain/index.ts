import {
    PredictionMarketExchange,
    MarketFilterParams,
    EventFetchParams,
    OHLCVParams,
    TradesParams,
    MyTradesParams,
    HistoryFilterParams,
    ExchangeCredentials,
} from '../../BaseExchange';
import {
    UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, UserTrade,
    Position, Balance, Order, CreateOrderParams, BuiltOrder,
} from '../../types';
import { NotSupported, BadRequest } from '../../errors';
import { RainAuth, RainCredentials } from './auth';
import { RainFetcher } from './fetcher';
import { RainNormalizer } from './normalizer';
import { RainWebSocket } from './websocket';
import { rainErrorMapper } from './errors';
import { ARBITRUM_USDT, ARBITRUM_USDC, USDT_DECIMALS, priceBigIntToNumber, resolveDecimals } from './utils';
import { parseAbi, type Hex } from 'viem';

const ARBITRUM_CHAIN_ID = 42161;
const PRICE_SCALE = 10n ** 18n;
const MAX_UINT256 = (1n << 256n) - 1n;
const ERC20_ABI = parseAbi([
    'function allowance(address owner, address spender) view returns (uint256)',
]);

interface RainTxRaw {
    to: `0x${string}`;
    data: `0x${string}`;
    value?: bigint;
}

/** Encoded form of an Order.id so cancelOrder can round-trip without subgraph state. */
interface RainOrderRef {
    marketContract: `0x${string}`;
    side: 'buy' | 'sell';
    option: number;
    pricePerShare1e18: string;   // bigint stringified
    rainOrderId: string;          // SDK-side order ID once we have it; '0' for AMM swaps
    txHash?: string;
}

function encodeOrderId(ref: RainOrderRef): string {
    return `rain:${ref.marketContract}:${ref.side}:${ref.option}:${ref.pricePerShare1e18}:${ref.rainOrderId}:${ref.txHash ?? ''}`;
}

function decodeOrderId(orderId: string): RainOrderRef {
    const parts = orderId.split(':');
    if (parts.length < 7 || parts[0] !== 'rain') {
        throw new BadRequest(
            `Invalid Rain order id: "${orderId}". Expected "rain:{contract}:{side}:{option}:{price1e18}:{rainOrderId}:{txHash}".`,
            'Rain',
        );
    }
    return {
        marketContract: parts[1] as `0x${string}`,
        side: parts[2] as 'buy' | 'sell',
        option: Number(parts[3]),
        pricePerShare1e18: parts[4],
        rainOrderId: parts[5],
        txHash: parts[6] || undefined,
    };
}

export class RainExchange extends PredictionMarketExchange {
    protected override readonly capabilityOverrides = {
        fetchSeries: false as const,
        fetchOrderBook: 'emulated' as const,
        // Emulated batch: loops the single-outcome fetchOrderBook (no native batch endpoint).
        fetchOrderBooks: 'emulated' as const,
        watchOrderBook: 'emulated' as const,
        watchTrades: 'emulated' as const,
        // Trading is on-chain via Rain SDK + viem. open/closed orders + fetchOrder
        // need subgraph; without it, they throw at call-time with a clear message.
        fetchOpenOrders: 'emulated' as const,
        fetchClosedOrders: 'emulated' as const,
        fetchOrder: 'emulated' as const,
    };

    private readonly auth: RainAuth;
    private readonly fetcher: RainFetcher;
    private readonly normalizer: RainNormalizer;
    private ws?: RainWebSocket;

    constructor(credentials?: RainCredentials) {
        super(credentials as ExchangeCredentials);
        this.rateLimit = 250;

        this.auth = new RainAuth(credentials ?? {});
        this.fetcher = new RainFetcher({
            environment: credentials?.environment,
            subgraphUrl: credentials?.subgraphUrl,
            subgraphApiKey: credentials?.subgraphApiKey,
            wsRpcUrl: credentials?.wsRpcUrl,
        });
        this.normalizer = new RainNormalizer();
    }

    get name(): string {
        return 'Rain';
    }

    // ------------------------------------------------------------------------
    // Market data
    // ------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        const limit = params?.limit ?? 25;
        const status = (params?.status === 'closed' ? 'Closed' : params?.status === 'all' ? undefined : 'Live') as string | undefined;
        const sortBy = params?.sort === 'volume' ? 'Volumn' : params?.sort === 'newest' ? 'latest' : 'Liquidity';

        const rawMarkets = await this.fetcher.fetchRawMarkets({ limit, status, sortBy });
        return rawMarkets
            .map((raw) => this.normalizer.normalizeMarket(raw))
            .filter((m): m is UnifiedMarket => m !== null);
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        if (params.series !== undefined) return []; // Rain has no series concept

        const limit = params.limit ?? 25;
        const rawMarkets = await this.fetcher.fetchRawMarkets({
            limit,
            status: params.status === 'closed' ? 'Closed' : 'Live',
        });
        return rawMarkets
            .map((raw) => this.normalizer.normalizeEvent(raw))
            .filter((e): e is UnifiedEvent => e !== null);
    }

    async fetchOHLCV(outcomeId: string, params: OHLCVParams): Promise<PriceCandle[]> {
        const parts = outcomeId.split(':');
        if (parts.length < 3 || parts[0] !== 'rain') {
            throw new Error(`Invalid Rain outcomeId format: "${outcomeId}". Expected "rain:{marketId}:{choiceIndex}".`);
        }
        const marketId = parts[1];
        const choiceIndex = Number(parts[2]);
        const interval = RainNormalizer.mapInterval(params.resolution);
        const market = await this.fetcher.fetchRawMarket(marketId);
        const contractAddress = market?.details?.contractAddress;
        if (!contractAddress) return [];
        const raw = await this.fetcher.fetchRawOHLCV(contractAddress, choiceIndex, interval, params.limit);
        return this.normalizer.normalizeOHLCV(raw, params.limit);
    }

    async fetchOrderBook(outcomeId: string, _limit?: number, _params?: Record<string, any>): Promise<OrderBook> {
        const resolved = await this.resolveOutcomeAlias(outcomeId, _params);
        outcomeId = resolved.outcomeId;
        const parts = outcomeId.split(':');
        if (parts.length < 3) {
            throw new Error(`Invalid Rain outcomeId format: "${outcomeId}". Expected "rain:{marketId}:{choiceIndex}".`);
        }
        const raw = await this.fetcher.fetchRawMarket(parts[1]);
        if (!raw) return { bids: [], asks: [], timestamp: Date.now() };
        return this.normalizer.normalizeOrderBook(raw, outcomeId);
    }

    async fetchOrderBooks(outcomeIds: string[]): Promise<Record<string, OrderBook>> {
        const response: Record<string, OrderBook> = {};
        for (const outcomeId of outcomeIds) {
            response[outcomeId] = await this.fetchOrderBook(outcomeId);
        }
        return response;
    }

    async fetchTrades(outcomeId: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        const parts = outcomeId.split(':');
        if (parts.length < 2) {
            throw new Error(`Invalid Rain id format: "${outcomeId}". Expected "rain:{marketId}".`);
        }
        const market = await this.fetcher.fetchRawMarket(parts[1]);
        const contract = market?.details?.contractAddress;
        if (!contract) return [];
        const raw = await this.fetcher.fetchRawMarketTrades(contract, params.limit);
        return this.normalizer.normalizeMarketTrades(raw);
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        const wallet = this.auth.requireWalletAddress('fetchMyTrades');
        const marketParts = params?.marketId ? params.marketId.split(':') : [];
        const marketId = marketParts.length >= 2 ? marketParts[1] : undefined;

        let marketAddress: string | undefined;
        if (marketId) {
            const m = await this.fetcher.fetchRawMarket(marketId);
            marketAddress = m?.details?.contractAddress;
        }

        const raw = await this.fetcher.fetchRawUserTrades(wallet, marketAddress, params?.limit);
        return this.normalizer.normalizeUserTrades(raw);
    }

    async fetchPositions(address?: string): Promise<Position[]> {
        const wallet = address ?? this.auth.requireWalletAddress('fetchPositions');
        const raw = await this.fetcher.fetchRawPositions(wallet);
        return this.normalizer.normalizePositions(raw);
    }

    async fetchBalance(address?: string): Promise<Balance[]> {
        const wallet = address ?? this.auth.requireWalletAddress('fetchBalance');
        const raw = await this.fetcher.fetchRawBalance(wallet, [ARBITRUM_USDT, ARBITRUM_USDC]);
        return this.normalizer.normalizeBalance(raw);
    }

    // ------------------------------------------------------------------------
    // Trading -- on-chain via Rain SDK + viem.
    // ------------------------------------------------------------------------

    async buildOrder(params: CreateOrderParams): Promise<BuiltOrder> {
        try {
            const { marketContract, baseToken, baseDecimals } = await this.resolveContractFor(params);
            const choice = this.parseChoiceIndex(params.outcomeId);
            const sdk = await this.fetcher.sdkClient();

            let rawTx: RainTxRaw;
            let pricePerShare1e18 = '0';

            if (params.side === 'buy' && params.type === 'market') {
                rawTx = sdk.buildBuyOptionRawTx({
                    marketContractAddress: marketContract,
                    selectedOption: BigInt(choice),
                    buyAmountInWei: this.toBaseWei(params.amount, baseDecimals),
                });
            } else if (params.side === 'buy' && params.type === 'limit') {
                if (params.price == null) {
                    throw new BadRequest('Limit buy requires a price (0 < price < 1).', 'Rain');
                }
                const price1e18 = this.toPrice1e18(params.price);
                pricePerShare1e18 = price1e18.toString();
                rawTx = sdk.buildLimitBuyOptionTx({
                    marketContractAddress: marketContract,
                    selectedOption: choice,
                    pricePerShare: price1e18,
                    buyAmountInWei: this.toBaseWei(params.amount, baseDecimals),
                    tokenDecimals: baseDecimals,
                });
            } else if (params.side === 'sell' && params.type === 'limit') {
                if (params.price == null) {
                    throw new BadRequest('Limit sell requires a price (0 < price < 1).', 'Rain');
                }
                pricePerShare1e18 = this.toPrice1e18(params.price).toString();
                rawTx = sdk.buildSellOptionTx({
                    marketContractAddress: marketContract,
                    selectedOption: choice,
                    pricePerShare: params.price,
                    shares: this.toBaseWei(params.amount, baseDecimals),
                    tokenDecimals: baseDecimals,
                });
            } else {
                // params.side === 'sell' && params.type === 'market'
                throw new NotSupported(
                    'Rain has no AMM market-sell. Sells go through the orderbook as limit orders — pass type:"limit" with a price.',
                    'Rain',
                );
            }

            const ref: RainOrderRef = {
                marketContract,
                side: params.side,
                option: choice,
                pricePerShare1e18,
                rainOrderId: '0',
            };

            return {
                exchange: 'Rain',
                params,
                tx: {
                    to: rawTx.to,
                    data: rawTx.data,
                    value: (rawTx.value ?? 0n).toString(),
                    chainId: ARBITRUM_CHAIN_ID,
                },
                raw: { rawTx, ref, baseToken, baseDecimals },
            };
        } catch (error: any) {
            throw rainErrorMapper.mapError(error);
        }
    }

    async submitOrder(built: BuiltOrder): Promise<Order> {
        try {
            const wallet = this.auth.ensureWalletClient();
            const account = wallet.account;
            if (!account) throw new Error('Wallet client has no account.');

            const raw = built.raw as { rawTx: RainTxRaw; ref: RainOrderRef; baseToken: `0x${string}`; baseDecimals: number };

            if (built.params.side === 'buy') {
                await this.ensureApproval(raw.baseToken, raw.ref.marketContract, this.toBaseWei(built.params.amount, raw.baseDecimals));
            }

            const txHash = await wallet.sendTransaction({
                account,
                chain: wallet.chain,
                to: raw.rawTx.to,
                data: raw.rawTx.data,
                value: raw.rawTx.value ?? 0n,
            });

            const ref: RainOrderRef = { ...raw.ref, txHash };
            const isMarket = built.params.type === 'market';

            return {
                id: encodeOrderId(ref),
                marketId: built.params.marketId,
                outcomeId: built.params.outcomeId,
                side: built.params.side,
                type: built.params.type,
                price: built.params.price ?? (raw.ref.pricePerShare1e18 !== '0'
                    ? priceBigIntToNumber(BigInt(raw.ref.pricePerShare1e18))
                    : undefined),
                amount: built.params.amount,
                status: isMarket ? 'filled' : 'open',
                filled: isMarket ? built.params.amount : 0,
                remaining: isMarket ? 0 : built.params.amount,
                timestamp: Date.now(),
                txHash,
                chain: 'arbitrum',
            };
        } catch (error: any) {
            throw rainErrorMapper.mapError(error);
        }
    }

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const built = await this.buildOrder(params);
        return this.submitOrder(built);
    }

    async cancelOrder(orderId: string): Promise<Order> {
        try {
            const ref = decodeOrderId(orderId);
            if (ref.rainOrderId === '0') {
                throw new BadRequest(
                    'Cannot cancel a Rain order without a Rain orderID. Market AMM swaps are atomic; only resting limit orders are cancellable.',
                    'Rain',
                );
            }
            const sdk = await this.fetcher.sdkClient();
            const builder = ref.side === 'buy' ? sdk.buildCancelBuyOrdersTx : sdk.buildCancelSellOrdersTx;
            const rawTx = builder({
                marketContractAddress: ref.marketContract,
                orders: [{
                    option: ref.option,
                    price: priceBigIntToNumber(BigInt(ref.pricePerShare1e18)),
                    orderID: BigInt(ref.rainOrderId),
                }],
            });

            const wallet = this.auth.ensureWalletClient();
            const account = wallet.account;
            if (!account) throw new Error('Wallet client has no account.');
            const txHash = await wallet.sendTransaction({
                account,
                chain: wallet.chain,
                to: rawTx.to,
                data: rawTx.data,
                value: rawTx.value ?? 0n,
            });

            return {
                id: orderId,
                marketId: `rain:unknown`,
                outcomeId: `rain:unknown:${ref.option}`,
                side: ref.side,
                type: 'limit',
                amount: 0,
                status: 'canceled',
                filled: 0,
                remaining: 0,
                timestamp: Date.now(),
                txHash,
                chain: 'arbitrum',
            };
        } catch (error: any) {
            throw rainErrorMapper.mapError(error);
        }
    }

    async fetchOrder(orderId: string): Promise<Order> {
        const ref = decodeOrderId(orderId);
        if (!ref.txHash) {
            throw new BadRequest('Rain order id has no tx hash to look up.', 'Rain');
        }
        const sdk = await this.fetcher.sdkClient();
        const details = await (sdk as any).getTransactionDetails({ transactionHash: ref.txHash });
        return {
            id: orderId,
            marketId: 'rain:unknown',
            outcomeId: `rain:unknown:${ref.option}`,
            side: ref.side,
            type: ref.rainOrderId === '0' ? 'market' : 'limit',
            amount: 0,
            status: details?.status === 'success' ? 'filled' : 'rejected',
            filled: 0,
            remaining: 0,
            timestamp: details?.timestamp ? Number(details.timestamp) * 1000 : Date.now(),
            txHash: ref.txHash,
            chain: 'arbitrum',
        };
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        // Open orders = limit_*_placed transactions whose orderID has not been
        // cancelled or filled. Needs subgraph; without it we honestly return [].
        const wallet = this.auth.resolveAddress();
        if (!wallet) return [];
        const raw = await this.fetcher.fetchRawUserTrades(wallet, undefined, 200);
        if (!raw) return [];

        const open = new Map<string, { side: 'buy' | 'sell'; option: number; price: bigint; orderId: bigint; market: `0x${string}`; ts: number }>();
        for (const tx of raw.transactions ?? []) {
            const key = `${tx.marketAddress}:${tx.orderId}:${tx.type.startsWith('limit_buy') ? 'buy' : 'sell'}`;
            if (tx.type === 'limit_buy_placed' || tx.type === 'limit_sell_placed') {
                open.set(key, {
                    side: tx.type === 'limit_buy_placed' ? 'buy' : 'sell',
                    option: tx.option ?? 0,
                    price: BigInt(tx.price ?? 0),
                    orderId: BigInt(tx.orderId ?? 0),
                    market: tx.marketAddress,
                    ts: Number(tx.timestamp) * 1000,
                });
            } else if (
                tx.type === 'limit_buy_filled' || tx.type === 'limit_sell_filled' ||
                tx.type === 'cancel_buy' || tx.type === 'cancel_sell'
            ) {
                const side = tx.type.includes('buy') ? 'buy' : 'sell';
                open.delete(`${tx.marketAddress}:${tx.orderId}:${side}`);
            }
        }

        const want = marketId ? marketId.replace(/^rain:/, '') : undefined;
        const out: Order[] = [];
        for (const o of open.values()) {
            const ref: RainOrderRef = {
                marketContract: o.market,
                side: o.side,
                option: o.option,
                pricePerShare1e18: o.price.toString(),
                rainOrderId: o.orderId.toString(),
            };
            const oMarketId = `rain:${o.market}`;
            if (want && oMarketId !== `rain:${want}`) continue;
            out.push({
                id: encodeOrderId(ref),
                marketId: oMarketId,
                outcomeId: `rain:${o.market}:${o.option}`,
                side: o.side,
                type: 'limit',
                price: priceBigIntToNumber(o.price),
                amount: 0,
                status: 'open',
                filled: 0,
                remaining: 0,
                timestamp: o.ts,
                chain: 'arbitrum',
            });
        }
        return out;
    }

    // ------------------------------------------------------------------------
    // Trading helpers
    // ------------------------------------------------------------------------

    private parseChoiceIndex(outcomeId: string): number {
        const parts = outcomeId.split(':');
        if (parts.length < 3) {
            throw new BadRequest(
                `Invalid Rain outcomeId: "${outcomeId}". Expected "rain:{marketId}:{choiceIndex}".`,
                'Rain',
            );
        }
        const idx = Number(parts[2]);
        if (!Number.isInteger(idx) || idx < 0) {
            throw new BadRequest(`Invalid choice index in outcomeId: "${outcomeId}".`, 'Rain');
        }
        return idx;
    }

    private toBaseWei(amount: number, decimals: number): bigint {
        // amount is the user-facing decimal token amount (e.g., 10 USDT). Convert
        // to base-token wei. For sells (shares) we accept a decimal share count.
        const scale = 10n ** BigInt(decimals);
        const PRECISION = 1_000_000;
        return (BigInt(Math.round(amount * PRECISION)) * scale) / BigInt(PRECISION);
    }

    private toPrice1e18(price: number): bigint {
        if (price <= 0 || price >= 1) {
            throw new BadRequest(`Rain price must satisfy 0 < price < 1, got ${price}.`, 'Rain');
        }
        const PRECISION = 1_000_000n;
        return (BigInt(Math.round(price * Number(PRECISION))) * PRICE_SCALE) / PRECISION;
    }

    private async resolveContractFor(params: CreateOrderParams): Promise<{ marketContract: `0x${string}`; baseToken: `0x${string}`; baseDecimals: number }> {
        const marketParts = params.marketId.split(':');
        if (marketParts.length < 2 || marketParts[0] !== 'rain') {
            throw new BadRequest(`Invalid Rain marketId: "${params.marketId}". Expected "rain:{marketId}".`, 'Rain');
        }
        const m = await this.fetcher.fetchRawMarket(marketParts[1]);
        if (!m?.details?.contractAddress) {
            throw new BadRequest(`Could not resolve contract address for Rain market ${params.marketId}.`, 'Rain');
        }
        return {
            marketContract: m.details.contractAddress,
            baseToken: m.details.baseToken ?? (ARBITRUM_USDT as `0x${string}`),
            baseDecimals: resolveDecimals(m.details.baseTokenDecimals, USDT_DECIMALS),
        };
    }

    private async ensureApproval(token: `0x${string}`, spender: `0x${string}`, neededAmount: bigint): Promise<void> {
        const pub = this.auth.ensurePublicClient();
        const owner = this.auth.resolveAddress() as `0x${string}` | undefined;
        if (!owner) {
            throw new Error('Cannot check allowance without a wallet address.');
        }
        const allowance = await pub.readContract({
            address: token,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [owner, spender],
        }) as bigint;
        if (allowance >= neededAmount) return;

        const sdk = await this.fetcher.sdkClient();
        const approveTx = sdk.buildApprovalTx({
            tokenAddress: token,
            spender,
            amount: MAX_UINT256,
        });
        if (approveTx instanceof Error) {
            throw approveTx;
        }
        const wallet = this.auth.ensureWalletClient();
        const account = wallet.account;
        if (!account) throw new Error('Wallet client has no account.');
        const hash = await wallet.sendTransaction({
            account,
            chain: wallet.chain,
            to: approveTx.to as Hex,
            data: approveTx.data as Hex,
            value: approveTx.value ?? 0n,
        });
        await pub.waitForTransactionReceipt({ hash });
    }

    // ------------------------------------------------------------------------
    // WebSocket
    // ------------------------------------------------------------------------

    private ensureWebSocket(): RainWebSocket {
        if (!this.ws) {
            const wsRpcUrl = (this.auth as any).creds?.wsRpcUrl as string | undefined;
            if (!wsRpcUrl) {
                throw new Error('Rain WebSocket requires wsRpcUrl in credentials.');
            }
            this.ws = new RainWebSocket({
                wsRpcUrl,
                environment: (this.auth as any).creds?.environment,
            });
        }
        return this.ws;
    }

    async watchOrderBook(outcomeId: string, _limit?: number, _params: Record<string, any> = {}): Promise<OrderBook> {
        const parts = outcomeId.split(':');
        if (parts.length < 3) {
            throw new Error(`Invalid Rain outcomeId for watchOrderBook: "${outcomeId}".`);
        }
        const market = await this.fetcher.fetchRawMarket(parts[1]);
        const contract = market?.details?.contractAddress;
        if (!contract) throw new Error(`No contract address for Rain market ${parts[1]}.`);
        return this.ensureWebSocket().watchOrderBook(contract, outcomeId);
    }

    async watchTrades(outcomeId: string): Promise<Trade[]> {
        const parts = outcomeId.split(':');
        if (parts.length < 2) {
            throw new Error(`Invalid Rain outcomeId for watchTrades: "${outcomeId}".`);
        }
        const market = await this.fetcher.fetchRawMarket(parts[1]);
        const contract = market?.details?.contractAddress;
        if (!contract) throw new Error(`No contract address for Rain market ${parts[1]}.`);
        return this.ensureWebSocket().watchTrades(contract);
    }

    async close(): Promise<void> {
        if (this.ws) {
            await this.ws.close();
            this.ws = undefined;
        }
        await this.fetcher.close();
    }
}
