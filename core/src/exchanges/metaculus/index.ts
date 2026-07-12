import {
    PredictionMarketExchange,
    MarketFetchParams,
    EventFetchParams,
    ExchangeCredentials,
} from "../../BaseExchange";
import { UnifiedMarket, UnifiedEvent, CreateOrderParams, Order } from "../../types";
import { AuthenticationError } from "../../errors";
import { parseOpenApiSpec } from "../../utils/openapi";
import { metaculusApiSpec } from "./api";
import { metaculusErrorMapper } from "./errors";
import { DEFAULT_BASE_URL } from "./utils";
import { fetchMarkets } from "./fetchMarkets";
import { fetchEvents } from "./fetchEvents";
import { createOrder, CreateOrderContext } from "./createOrder";
import { cancelOrder, CancelOrderContext } from "./cancelOrder";

/**
 * Metaculus exchange integration.
 *
 * Metaculus is a reputation-based forecasting platform. Unlike CLOB exchanges
 * (Polymarket, Kalshi), there are no financial stakes -- users submit
 * probability forecasts and earn reputation points scored on accuracy.
 *
 * ## Supported operations
 *
 * - **fetchMarkets / fetchEvents**: Browse questions, community predictions,
 *   and tournament structures. Group-of-questions posts are automatically
 *   expanded into individual sub-question markets.
 *
 * - **createOrder**: Submit a probability forecast on a question.
 *   Maps `price` (0-1 exclusive) to `probability_yes`. The `side`, `type`,
 *   and `amount` params are ignored since Metaculus forecasts are not
 *   buy/sell orders. See {@link createOrder} for details.
 *
 * - **cancelOrder**: Withdraw a forecast from a question. Pass the Metaculus
 *   question ID as the orderId.
 *
 * ## Authentication
 *
 * Pass `{ apiToken: "..." }` from your Metaculus account settings.
 * All API operations require a token -- Metaculus no longer allows
 * unauthenticated access to any endpoint.
 *
 * ## Question types
 *
 * | Type | fetchMarkets | createOrder |
 * |------|-------------|-------------|
 * | Binary | Yes (YES/NO outcomes) | Yes (`price` = probability_yes) |
 * | Multiple-choice | Yes (one outcome per option) | Yes (redistributes other categories) |
 * | Group-of-questions | Yes (expanded to sub-question markets) | Yes (per sub-question) |
 * | Continuous/numeric/date | Yes (read-only HIGHER/LOWER) | No (requires 201-point CDF) |
 */
export class MetaculusExchange extends PredictionMarketExchange {
    protected override readonly capabilityOverrides = {
        fetchSeries: false as const,
    };

    private readonly apiToken?: string;
    private readonly baseUrl: string;

    constructor(credentials?: ExchangeCredentials) {
        super(credentials);

        this.apiToken = credentials?.apiToken;

        // Rate-limit conservatively; authenticated users get higher Metaculus quotas
        this.rateLimit = 500;

        this.baseUrl =
            credentials?.baseUrl || process.env.METACULUS_BASE_URL || DEFAULT_BASE_URL;
        const descriptor = parseOpenApiSpec(metaculusApiSpec, this.baseUrl);
        this.defineImplicitApi(descriptor);
    }

    get name(): string {
        return "Metaculus";
    }

    protected override mapImplicitApiError(error: any): any {
        throw metaculusErrorMapper.mapError(error);
    }

    /**
     * Sign requests with an API token when one is provided.
     * Metaculus uses token-based auth: `Authorization: Token <token>`.
     */
    protected override sign(
        _method: string,
        _path: string,
        _params: Record<string, any>,
    ): Record<string, string> {
        if (this.apiToken) {
            return { Authorization: `Token ${this.apiToken}` };
        }
        return {};
    }

    /**
     * Get auth headers, throwing if no token is configured.
     * Used by trading methods that require authentication.
     */
    private getAuthHeaders(): Record<string, string> {
        if (!this.apiToken) {
            throw new AuthenticationError(
                'Metaculus API token required for this operation. '
                + 'Pass { apiToken: "..." } when constructing MetaculusExchange.',
                "Metaculus",
            );
        }
        return { Authorization: `Token ${this.apiToken}` };
    }

    // -------------------------------------------------------------------------
    // Market Data
    // -------------------------------------------------------------------------

    protected async fetchMarketsImpl(
        params?: MarketFetchParams,
    ): Promise<UnifiedMarket[]> {
        return fetchMarkets(params, this.callApi.bind(this));
    }

    protected async fetchEventsImpl(
        params: EventFetchParams,
    ): Promise<UnifiedEvent[]> {
        return fetchEvents(params, this.callApi.bind(this));
    }

    // -------------------------------------------------------------------------
    // Trading (Forecasting)
    // -------------------------------------------------------------------------

    /**
     * Submit a probability forecast on a Metaculus question.
     *
     * Maps from the unified `createOrder` interface:
     * - `price` -> the probability to forecast (0-1 exclusive)
     * - `outcomeId` -> encodes the question ID and type
     * - `side`, `type`, `amount` -> ignored (Metaculus forecasts are not orders)
     *
     * For binary questions, sets `probability_yes` directly.
     * For multiple-choice, redistributes other categories proportionally.
     * Continuous questions are not supported (throws InvalidOrder).
     *
     * @throws {AuthenticationError} If no API token is configured.
     * @throws {InvalidOrder} If the question type is continuous or price is invalid.
     */
    override async createOrder(params: CreateOrderParams): Promise<Order> {
        const ctx: CreateOrderContext = {
            http: this.http,
            getAuthHeaders: () => this.getAuthHeaders(),
            baseUrl: this.baseUrl,
            fetchOutcomes: async (marketId: string) => {
                const markets = await this.fetchMarkets({ marketId });
                return markets.length > 0 ? markets[0].outcomes : [];
            },
        };
        return createOrder(params, ctx);
    }

    /**
     * Withdraw a forecast from a Metaculus question.
     *
     * The `orderId` should be the Metaculus question ID (numeric).
     * If you used createOrder, extract the question ID from the
     * outcomeId (the part before the hyphen).
     *
     * @throws {AuthenticationError} If no API token is configured.
     * @throws {ValidationError} If orderId is not a valid question ID.
     */
    override async cancelOrder(orderId: string): Promise<Order> {
        const ctx: CancelOrderContext = {
            http: this.http,
            getAuthHeaders: () => this.getAuthHeaders(),
            baseUrl: this.baseUrl,
        };
        return cancelOrder(orderId, ctx);
    }
}
