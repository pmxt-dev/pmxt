import {
    Connection,
    PublicKey,
    Transaction,
    TransactionInstruction,
    SystemProgram,
} from '@solana/web3.js';
import {
    PredictionMarketExchange,
    MarketFetchParams,
    EventFetchParams,
    ExchangeCredentials,
} from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    PriceCandle,
    OrderBook,
    Trade,
    Order,
    Position,
    Balance,
    CreateOrderParams,
} from '../../types';
import { AuthenticationError, InvalidOrder, ExchangeNotAvailable } from '../../errors';
import { BaoziAuth } from './auth';
import { BaoziWebSocket } from './websocket';
import { baoziErrorMapper } from './errors';
import { BaoziFetcher } from './fetcher';
import { BaoziNormalizer } from './normalizer';
import {
    PROGRAM_ID,
    LAMPORTS_PER_SOL,
    PLACE_BET_SOL_DISCRIMINATOR,
    BET_ON_RACE_OUTCOME_SOL_DISCRIMINATOR,
    parseMarket,
    parseRaceMarket,
    deriveConfigPda,
    derivePositionPda,
    deriveRacePositionPda,
    deriveMarketPda,
    deriveRaceMarketPda,
    mapBooleanToUnified,
    mapRaceToUnified,
} from './utils';

export interface BaoziExchangeOptions {
    credentials?: ExchangeCredentials;
    rpcUrl?: string;
}

export class BaoziExchange extends PredictionMarketExchange {
    protected override readonly capabilityOverrides = {
        fetchOHLCV: 'emulated' as const,
        fetchOrderBook: 'emulated' as const,
        fetchTrades: 'emulated' as const,
        fetchOpenOrders: 'emulated' as const,
        cancelOrder: false as const,
        watchTrades: false as const,
    };

    private auth?: BaoziAuth;
    private connection: Connection;
    private ws?: BaoziWebSocket;
    private readonly fetcher: BaoziFetcher;
    private readonly normalizer: BaoziNormalizer;

    constructor(options?: ExchangeCredentials | BaoziExchangeOptions) {
        let credentials: ExchangeCredentials | undefined;
        let rpcUrl: string | undefined;

        if (options && 'credentials' in options) {
            credentials = options.credentials;
            rpcUrl = (options as BaoziExchangeOptions).rpcUrl;
        } else {
            credentials = options as ExchangeCredentials | undefined;
        }

        super(credentials);
        this.rateLimit = 500;

        rpcUrl = rpcUrl
            || process.env.BAOZI_RPC_URL
            || process.env.HELIUS_RPC_URL
            || 'https://api.mainnet-beta.solana.com';

        this.connection = new Connection(rpcUrl, 'confirmed');

        if (credentials?.privateKey) {
            this.auth = new BaoziAuth(credentials);
        }

        this.fetcher = new BaoziFetcher(this.connection);
        this.normalizer = new BaoziNormalizer();
    }

    get name(): string {
        return 'Baozi';
    }

    // -----------------------------------------------------------------------
    // Market Data (fetcher -> normalizer)
    // -----------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        const rawMarkets = await this.fetcher.fetchRawMarkets(params);
        return this.normalizer.normalizeMarkets(rawMarkets, params);
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        const rawMarkets = await this.fetcher.fetchRawEvents(params);
        return this.normalizer.normalizeEvents(rawMarkets, {
            query: params.query,
            limit: params.limit,
            offset: params.offset,
            status: params.status,
            searchIn: params.searchIn,
        });
    }

    async fetchOHLCV(): Promise<PriceCandle[]> {
        // Baozi has no historical price/trade API without a custom indexer
        return [];
    }

    async fetchOrderBook(outcomeId: string, _limit?: number, _params?: Record<string, any>): Promise<OrderBook> {
        const rawMarket = await this.fetcher.fetchRawOrderBook(outcomeId);
        return this.normalizer.normalizeOrderBook(rawMarket, outcomeId);
    }

    async fetchTrades(): Promise<Trade[]> {
        // Baozi has no trade history API without a custom indexer
        return [];
    }

    // -----------------------------------------------------------------------
    // User Data (fetcher -> normalizer)
    // -----------------------------------------------------------------------

    async fetchBalance(): Promise<Balance[]> {
        const auth = this.ensureAuth();
        const rawBalance = await this.fetcher.fetchRawUserBalance(auth.getPublicKey());
        return this.normalizer.normalizeBalance(rawBalance);
    }

    async fetchPositions(): Promise<Position[]> {
        try {
            const auth = this.ensureAuth();
            const userPubkey = auth.getPublicKey();

            const { booleanPositions, racePositions } = await this.fetcher.fetchRawUserPositions(userPubkey);

            // Build market lookup for current prices
            const marketLookup = new Map<string, UnifiedMarket>();

            for (const { parsed: pos } of booleanPositions) {
                if (pos.claimed) continue;
                const marketPda = deriveMarketPda(pos.marketId);
                const marketPdaStr = marketPda.toString();
                if (!marketLookup.has(marketPdaStr)) {
                    try {
                        const rawMarket = await this.fetcher.fetchRawMarketAccount(marketPda);
                        if (rawMarket) {
                            const unified = this.normalizer.normalizeMarket(rawMarket);
                            if (unified) marketLookup.set(marketPdaStr, unified);
                        }
                    } catch (error: unknown) {
                        console.warn(`[Baozi] fetchPositions: failed to fetch boolean market account for PDA=${marketPdaStr}:`, error);
                        throw error;
                    }
                }
            }

            for (const { parsed: pos } of racePositions) {
                if (pos.claimed) continue;
                const racePda = deriveRaceMarketPda(pos.marketId);
                const racePdaStr = racePda.toString();
                if (!marketLookup.has(racePdaStr)) {
                    try {
                        const rawMarket = await this.fetcher.fetchRawMarketAccount(racePda);
                        if (rawMarket) {
                            const unified = this.normalizer.normalizeMarket(rawMarket);
                            if (unified) marketLookup.set(racePdaStr, unified);
                        }
                    } catch (error: unknown) {
                        console.warn(`[Baozi] fetchPositions: failed to fetch race market account for PDA=${racePdaStr}:`, error);
                        throw error;
                    }
                }
            }

            const boolPos = this.normalizer.normalizeBooleanPositions(booleanPositions, marketLookup);
            const racePos = this.normalizer.normalizeRacePositions(racePositions, marketLookup);

            return [...boolPos, ...racePos];
        } catch (error: any) {
            throw baoziErrorMapper.mapError(error);
        }
    }

    // -----------------------------------------------------------------------
    // Trading
    // -----------------------------------------------------------------------

    async createOrder(params: CreateOrderParams): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const keypair = auth.getKeypair();
            const outcomeId = params.outcomeId;

            // Determine if this is a boolean or race market bet
            const isYes = outcomeId.endsWith('-YES');
            const isNo = outcomeId.endsWith('-NO');
            const isBoolean = isYes || isNo;

            // Amount in lamports
            const amountLamports = BigInt(Math.round(params.amount * LAMPORTS_PER_SOL));

            let ix: TransactionInstruction;

            if (isBoolean) {
                // Build place_bet_sol instruction
                const marketPubkey = new PublicKey(outcomeId.replace(/-YES$|-NO$/, ''));

                // Fetch market to get market_id
                const marketInfo = await this.connection.getAccountInfo(marketPubkey);
                if (!marketInfo) throw new Error(`Market not found: ${marketPubkey}`);
                const market = parseMarket(marketInfo.data);

                const configPda = deriveConfigPda();
                const positionPda = derivePositionPda(market.marketId, keypair.publicKey);

                // Instruction data: discriminator(8) + outcome(1 bool) + amount(8 u64)
                const data = Buffer.alloc(17);
                PLACE_BET_SOL_DISCRIMINATOR.copy(data, 0);
                data.writeUInt8(isYes ? 1 : 0, 8); // outcome: true=YES, false=NO
                data.writeBigUInt64LE(amountLamports, 9);

                ix = new TransactionInstruction({
                    programId: PROGRAM_ID,
                    keys: [
                        { pubkey: configPda, isSigner: false, isWritable: false },
                        { pubkey: marketPubkey, isSigner: false, isWritable: true },
                        { pubkey: positionPda, isSigner: false, isWritable: true },
                        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
                        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
                        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                    ],
                    data,
                });
            } else {
                // Build bet_on_race_outcome_sol instruction
                const lastDash = outcomeId.lastIndexOf('-');
                if (lastDash === -1) {
                    throw new InvalidOrder(
                        `Invalid race outcomeId format: ${outcomeId}. Expected "{marketPubkey}-{index}"`,
                        'Baozi',
                    );
                }
                const outcomeIndex = parseInt(outcomeId.slice(lastDash + 1), 10);
                const marketPubkey = new PublicKey(outcomeId.slice(0, lastDash));

                // Fetch race market to get market_id
                const marketInfo = await this.connection.getAccountInfo(marketPubkey);
                if (!marketInfo) throw new Error(`Race market not found: ${marketPubkey}`);
                const raceMarket = parseRaceMarket(marketInfo.data);

                if (outcomeIndex >= raceMarket.outcomeCount) {
                    throw new InvalidOrder(
                        `Outcome index ${outcomeIndex} exceeds market outcome count ${raceMarket.outcomeCount}`,
                        'Baozi',
                    );
                }

                const configPda = deriveConfigPda();
                const racePositionPda = deriveRacePositionPda(raceMarket.marketId, keypair.publicKey);

                // Instruction data: discriminator(8) + outcome_index(1 u8) + amount(8 u64)
                const data = Buffer.alloc(17);
                BET_ON_RACE_OUTCOME_SOL_DISCRIMINATOR.copy(data, 0);
                data.writeUInt8(outcomeIndex, 8);
                data.writeBigUInt64LE(amountLamports, 9);

                ix = new TransactionInstruction({
                    programId: PROGRAM_ID,
                    keys: [
                        { pubkey: configPda, isSigner: false, isWritable: false },
                        { pubkey: marketPubkey, isSigner: false, isWritable: true },
                        { pubkey: racePositionPda, isSigner: false, isWritable: true },
                        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
                        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
                        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                    ],
                    data,
                });
            }

            // Build, sign, and send transaction
            const tx = new Transaction().add(ix);
            const { blockhash } = await this.connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            tx.feePayer = keypair.publicKey;
            tx.sign(keypair);

            const signature = await this.connection.sendRawTransaction(tx.serialize());
            await this.connection.confirmTransaction(signature, 'confirmed');

            return {
                id: signature,
                marketId: params.marketId,
                outcomeId: params.outcomeId,
                side: 'buy',
                type: 'market',
                price: undefined,
                amount: params.amount,
                status: 'filled',
                filled: params.amount,
                remaining: 0,
                timestamp: Date.now(),
            };
        } catch (error: any) {
            throw baoziErrorMapper.mapError(error);
        }
    }

    async cancelOrder(): Promise<Order> {
        throw new InvalidOrder(
            'Pari-mutuel bets are irrevocable and cannot be cancelled',
            'Baozi',
        );
    }

    async fetchOrder(orderId: string): Promise<Order> {
        try {
            const tx = await this.connection.getTransaction(orderId, {
                maxSupportedTransactionVersion: 0,
            });

            if (!tx) {
                throw new Error(`Transaction not found: ${orderId}`);
            }

            let marketId = '';
            let outcomeId = '';
            let amount = 0;

            const message = tx.transaction.message;
            const programIdIndex = message.staticAccountKeys.findIndex(
                (key: PublicKey) => key.equals(PROGRAM_ID),
            );

            if (programIdIndex !== -1) {
                for (const ix of message.compiledInstructions) {
                    if (ix.programIdIndex !== programIdIndex) continue;
                    const data = Buffer.from(ix.data);
                    if (data.length < 17) continue;

                    const discriminator = data.subarray(0, 8);
                    const isBooleanBet = discriminator.equals(PLACE_BET_SOL_DISCRIMINATOR);
                    const isRaceBet = discriminator.equals(BET_ON_RACE_OUTCOME_SOL_DISCRIMINATOR);

                    if (!isBooleanBet && !isRaceBet) continue;

                    const marketKeyIndex = ix.accountKeyIndexes[1];
                    const marketKey = message.staticAccountKeys[marketKeyIndex];
                    marketId = marketKey.toString();

                    const lamports = data.readBigUInt64LE(9);
                    amount = Number(lamports) / LAMPORTS_PER_SOL;

                    if (isBooleanBet) {
                        const outcome = data.readUInt8(8);
                        outcomeId = `${marketId}-${outcome === 1 ? 'YES' : 'NO'}`;
                    } else {
                        const outcomeIndex = data.readUInt8(8);
                        outcomeId = `${marketId}-${outcomeIndex}`;
                    }
                    break;
                }
            }

            return {
                id: orderId,
                marketId,
                outcomeId,
                side: 'buy',
                type: 'market',
                amount,
                status: tx.meta?.err ? 'rejected' : 'filled',
                filled: tx.meta?.err ? 0 : amount,
                remaining: 0,
                timestamp: (tx.blockTime || 0) * 1000,
            };
        } catch (error: any) {
            throw baoziErrorMapper.mapError(error);
        }
    }

    async fetchOpenOrders(): Promise<Order[]> {
        // Pari-mutuel bets execute instantly -- there are never open orders
        return [];
    }

    // -----------------------------------------------------------------------
    // WebSocket
    // -----------------------------------------------------------------------

    async watchOrderBook(outcomeId: string, _limit?: number, _params: Record<string, any> = {}): Promise<OrderBook> {
        if (!this.ws) {
            this.ws = new BaoziWebSocket();
        }
        return this.ws.watchOrderBook(this.connection, outcomeId);
    }

    async watchTrades(): Promise<Trade[]> {
        throw new ExchangeNotAvailable('Trade streaming is not available for Baozi', 'Baozi');
    }

    async close(): Promise<void> {
        if (this.ws) {
            await this.ws.close(this.connection);
            this.ws = undefined;
        }
    }

    // -----------------------------------------------------------------------
    // Private Helpers
    // -----------------------------------------------------------------------

    private ensureAuth(): BaoziAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'Trading operations require authentication. ' +
                'Initialize BaoziExchange with credentials: new BaoziExchange({ privateKey: "base58..." })',
                'Baozi',
            );
        }
        return this.auth;
    }
}
