import { Connection, PublicKey } from '@solana/web3.js';
import { MarketFetchParams, EventFetchParams } from '../../BaseExchange';
import { IExchangeFetcher } from '../interfaces';
import {
    PROGRAM_ID,
    MARKET_DISCRIMINATOR_BS58,
    RACE_MARKET_DISCRIMINATOR_BS58,
    USER_POSITION_DISCRIMINATOR_BS58,
    RACE_POSITION_DISCRIMINATOR_BS58,
    MARKET_DISCRIMINATOR,
    RACE_MARKET_DISCRIMINATOR,
    LAMPORTS_PER_SOL,
    parseMarket,
    parseRaceMarket,
    parseUserPosition,
    parseRacePosition,
    BaoziMarket,
    BaoziRaceMarket,
    BaoziUserPosition,
    BaoziRacePosition,
    Cache,
} from './utils';
import { baoziErrorMapper } from './errors';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Raw venue-native types returned by the fetcher
// ---------------------------------------------------------------------------

export interface BaoziRawBooleanMarket {
    pubkey: string;
    parsed: BaoziMarket;
}

export interface BaoziRawRaceMarket {
    pubkey: string;
    parsed: BaoziRaceMarket;
}

export type BaoziRawMarket = BaoziRawBooleanMarket | BaoziRawRaceMarket;

export interface BaoziRawBooleanPosition {
    pubkey: string;
    parsed: BaoziUserPosition;
}

export interface BaoziRawRacePosition {
    pubkey: string;
    parsed: BaoziRacePosition;
}

export interface BaoziRawBalance {
    lamports: number;
}

export function isRawBooleanMarket(raw: BaoziRawMarket): raw is BaoziRawBooleanMarket {
    return 'parsed' in raw && 'yesPool' in raw.parsed;
}

export function isRawRaceMarket(raw: BaoziRawMarket): raw is BaoziRawRaceMarket {
    return 'parsed' in raw && 'outcomeCount' in raw.parsed;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

const marketsCache = new Cache<BaoziRawMarket[]>(30_000); // 30s TTL

export class BaoziFetcher implements IExchangeFetcher<BaoziRawMarket, BaoziRawMarket> {
    private readonly connection: Connection;

    constructor(connection: Connection) {
        this.connection = connection;
    }

    async fetchRawMarkets(_params?: MarketFetchParams): Promise<BaoziRawMarket[]> {
        try {
            const cached = marketsCache.get();
            if (cached) {
                return cached;
            }

            const [booleanAccounts, raceAccounts] = await Promise.all([
                this.connection.getProgramAccounts(PROGRAM_ID, {
                    filters: [{ memcmp: { offset: 0, bytes: MARKET_DISCRIMINATOR_BS58 } }],
                }),
                this.connection.getProgramAccounts(PROGRAM_ID, {
                    filters: [{ memcmp: { offset: 0, bytes: RACE_MARKET_DISCRIMINATOR_BS58 } }],
                }),
            ]);

            const markets: BaoziRawMarket[] = [];

            let booleanSkipped = 0;
            for (const account of booleanAccounts) {
                try {
                    const parsed = parseMarket(account.account.data);
                    markets.push({ pubkey: account.pubkey.toString(), parsed } as BaoziRawBooleanMarket);
                } catch (parseError: unknown) {
                    booleanSkipped++;
                    logger.warn(`Baozi fetchRawMarkets: failed to parse boolean market account pubkey=${account.pubkey.toString()}`, { error: String(parseError) });
                }
            }
            if (booleanSkipped > 0) {
                logger.warn(`Baozi fetchRawMarkets: skipped ${booleanSkipped} malformed boolean market account(s) out of ${booleanAccounts.length}`);
            }

            let raceSkipped = 0;
            for (const account of raceAccounts) {
                try {
                    const parsed = parseRaceMarket(account.account.data);
                    markets.push({ pubkey: account.pubkey.toString(), parsed } as BaoziRawRaceMarket);
                } catch (parseError: unknown) {
                    raceSkipped++;
                    logger.warn(`Baozi fetchRawMarkets: failed to parse race market account pubkey=${account.pubkey.toString()}`, { error: String(parseError) });
                }
            }
            if (raceSkipped > 0) {
                logger.warn(`Baozi fetchRawMarkets: skipped ${raceSkipped} malformed race market account(s) out of ${raceAccounts.length}`);
            }

            marketsCache.set(markets);
            return markets;
        } catch (error: any) {
            throw baoziErrorMapper.mapError(error);
        }
    }

    async fetchRawEvents(params: EventFetchParams): Promise<BaoziRawMarket[]> {
        // Baozi markets are 1:1 with events
        return this.fetchRawMarkets({
            query: params.query,
            limit: params.limit,
            offset: params.offset,
            status: params.status,
            searchIn: params.searchIn,
        });
    }

    async fetchRawSingleMarket(pubkey: string): Promise<BaoziRawMarket | null> {
        try {
            const pk = new PublicKey(pubkey);
            const accountInfo = await this.connection.getAccountInfo(pk);
            if (!accountInfo) return null;

            const data = accountInfo.data;
            const discriminator = data.subarray(0, 8);

            if (Buffer.from(discriminator).equals(MARKET_DISCRIMINATOR)) {
                const parsed = parseMarket(data);
                return { pubkey, parsed } as BaoziRawBooleanMarket;
            }

            if (Buffer.from(discriminator).equals(RACE_MARKET_DISCRIMINATOR)) {
                const parsed = parseRaceMarket(data);
                return { pubkey, parsed } as BaoziRawRaceMarket;
            }

            return null;
        } catch (err) {
            logger.warn('BaoziFetcher: fetchRawSingleMarket failed', { pubkey, error: String(err) });
            return null;
        }
    }

    async fetchRawOrderBook(id: string): Promise<BaoziRawMarket | null> {
        const marketPubkey = id.replace(/-YES$|-NO$|-\d+$/, '');
        return this.fetchRawSingleMarket(marketPubkey);
    }

    async fetchRawUserPositions(walletAddress: PublicKey): Promise<{
        booleanPositions: BaoziRawBooleanPosition[];
        racePositions: BaoziRawRacePosition[];
    }> {
        try {
            const [booleanAccounts, raceAccounts] = await Promise.all([
                this.connection.getProgramAccounts(PROGRAM_ID, {
                    filters: [
                        { memcmp: { offset: 0, bytes: USER_POSITION_DISCRIMINATOR_BS58 } },
                        { memcmp: { offset: 8, bytes: walletAddress.toBase58() } },
                    ],
                }),
                this.connection.getProgramAccounts(PROGRAM_ID, {
                    filters: [
                        { memcmp: { offset: 0, bytes: RACE_POSITION_DISCRIMINATOR_BS58 } },
                        { memcmp: { offset: 8, bytes: walletAddress.toBase58() } },
                    ],
                }),
            ]);

            const booleanPositions: BaoziRawBooleanPosition[] = [];
            let boolPosSkipped = 0;
            for (const account of booleanAccounts) {
                try {
                    const parsed = parseUserPosition(account.account.data);
                    booleanPositions.push({ pubkey: account.pubkey.toString(), parsed });
                } catch (parseError: unknown) {
                    boolPosSkipped++;
                    logger.warn(`Baozi fetchRawUserPositions: failed to parse boolean position account pubkey=${account.pubkey.toString()}`, { error: String(parseError) });
                }
            }
            if (boolPosSkipped > 0) {
                logger.warn(`Baozi fetchRawUserPositions: skipped ${boolPosSkipped} malformed boolean position account(s) out of ${booleanAccounts.length}`);
            }

            const racePositions: BaoziRawRacePosition[] = [];
            let racePosSkipped = 0;
            for (const account of raceAccounts) {
                try {
                    const parsed = parseRacePosition(account.account.data);
                    racePositions.push({ pubkey: account.pubkey.toString(), parsed });
                } catch (parseError: unknown) {
                    racePosSkipped++;
                    logger.warn(`Baozi fetchRawUserPositions: failed to parse race position account pubkey=${account.pubkey.toString()}`, { error: String(parseError) });
                }
            }
            if (racePosSkipped > 0) {
                logger.warn(`Baozi fetchRawUserPositions: skipped ${racePosSkipped} malformed race position account(s) out of ${raceAccounts.length}`);
            }

            return { booleanPositions, racePositions };
        } catch (error: any) {
            throw baoziErrorMapper.mapError(error);
        }
    }

    async fetchRawUserBalance(walletAddress: PublicKey): Promise<BaoziRawBalance> {
        try {
            const lamports = await this.connection.getBalance(walletAddress);
            return { lamports };
        } catch (error: any) {
            throw baoziErrorMapper.mapError(error);
        }
    }

    async fetchRawMarketAccount(pubkey: PublicKey): Promise<BaoziRawMarket | null> {
        return this.fetchRawSingleMarket(pubkey.toString());
    }
}
