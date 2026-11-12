import { PredictionMarketExchange, MarketFetchParams, OHLCVParams, ExchangeCredentials } from '../../BaseExchange';
import { UnifiedMarket, PriceCandle } from '../../types';
import { AuthenticationError } from '../../errors';
import { parseOpenApiSpec } from '../../utils/openapi';
import { gaduinApiSpec } from './api';
import { GaduinAuth } from './auth';
import { gaduinErrorMapper } from './errors';
import { fetchMarkets } from './fetchMarkets';
import { fetchOHLCV } from './fetchOHLCV';
import { BASE_URL } from './utils';

/**
 * GADUIN exchange integration (read-only).
 *
 * GADUIN is a prediction market on transport outcomes (flight delays, train
 * punctuality, ship arrivals, weekly ship counts through chokepoints). Prices
 * come from an automated market maker (LMSR), so there is no order book.
 *
 * ## Supported operations
 *
 * - **fetchMarkets / fetchMarket**: Lookup by `marketId`, `slug` or `outcomeId`,
 *   or a listing of up to 100 markets filtered by `status`. `category` is one
 *   of `FLIGHT`, `TRAIN`, `SHIP`. Outcomes are published as-is (binary yes/no
 *   or multi-outcome such as on_time / delayed / cancelled).
 * - **fetchOHLCV**: Candles bucketed from the market's price history.
 *
 * ## Authentication
 *
 * Every REST read, market data included, needs a read-only API key
 * (`pk_live_...`) minted at https://gaduin.com/account/ai. Pass `{ apiKey }`;
 * it is exchanged for a short-lived token automatically. API access is
 * read-only: trading happens only on the GADUIN website.
 */
export class GaduinExchange extends PredictionMarketExchange {
    private readonly auth?: GaduinAuth;

    constructor(credentials?: ExchangeCredentials) {
        super(credentials);
        const baseUrl = credentials?.baseUrl || BASE_URL;
        if (credentials?.apiKey) {
            this.auth = new GaduinAuth(credentials.apiKey, this.http, baseUrl);
        }
        this.defineImplicitApi(parseOpenApiSpec(gaduinApiSpec, baseUrl));
    }

    get name(): string {
        return 'Gaduin';
    }

    protected override mapImplicitApiError(error: any): any {
        throw gaduinErrorMapper.mapError(error);
    }

    protected override async callApi(operationId: string, params?: Record<string, any> | any[]): Promise<any> {
        try {
            await this.ensureAuth().refresh();
        } catch (error) {
            throw gaduinErrorMapper.mapError(error);
        }
        return super.callApi(operationId, params);
    }

    protected override sign(_method: string, _path: string, _params: Record<string, any>): Record<string, string> {
        return this.ensureAuth().getHeaders();
    }

    private ensureAuth(): GaduinAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'Gaduin requires an API key for every REST read. Mint a read-only key at '
                + 'https://gaduin.com/account/ai and pass { apiKey: "pk_live_..." }.',
                'Gaduin',
            );
        }
        return this.auth;
    }

    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        return fetchMarkets(params, this.callApi.bind(this));
    }

    async fetchOHLCV(outcomeId: string, params: OHLCVParams): Promise<PriceCandle[]> {
        return fetchOHLCV(outcomeId, params, this.callApi.bind(this));
    }
}
