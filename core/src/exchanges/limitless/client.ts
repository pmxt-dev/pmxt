import { HttpClient, OrderClient, MarketFetcher, Side, OrderType } from '@limitless-exchange/sdk';
import { Wallet, providers, Contract, utils } from 'ethers';

const LIMITLESS_API_URL = 'https://api.limitless.exchange';

export interface LimitlessOrderParams {
    marketSlug: string;
    outcomeId: string; // The token ID
    side: 'BUY' | 'SELL';
    price: number; // Price in DOLLARS (e.g. 0.50)
    amount: number; // Number of shares
    type?: 'limit' | 'market';
}

/**
 * Wrapper client for Limitless Exchange using the official SDK.
 * Provides a simplified interface for market data and order operations.
 */
export class LimitlessClient {
    private httpClient: HttpClient;
    private orderClient: OrderClient;
    private marketFetcher: MarketFetcher;
    private signer: Wallet;
    private marketCache: Record<string, any> = {};

    constructor(privateKey: string, apiKey: string) {
        // Fix for common .env issue where newlines are escaped
        if (privateKey.includes('\\n')) {
            privateKey = privateKey.replace(/\\n/g, '\n');
        }

        this.signer = new Wallet(privateKey);

        // Initialize HTTP client with API key
        this.httpClient = new HttpClient({
            baseURL: LIMITLESS_API_URL,
            apiKey: apiKey,
            timeout: 30000,
        });

        // Initialize SDK clients
        // Note: SDK uses ethers v6, we use v5, so we cast to any
        this.orderClient = new OrderClient({
            httpClient: this.httpClient,
            wallet: this.signer as any,
        });

        this.marketFetcher = new MarketFetcher(this.httpClient);
    }

    /**
     * Get market details by slug.
     * Results are cached to reduce API calls.
     */
    async getMarket(slug: string) {
        if (this.marketCache[slug]) {
            return this.marketCache[slug];
        }

        const market = await this.marketFetcher.getMarket(slug);
        if (!market) {
            throw new Error(`Market not found: ${slug}`);
        }

        this.marketCache[slug] = market;
        return market;
    }

    /**
     * Create a limit order (GTC - Good Till Cancelled).
     * The SDK handles EIP-712 signing automatically.
     */
    async createOrder(params: LimitlessOrderParams) {
        const market = await this.getMarket(params.marketSlug);

        if (!market.venue || !market.venue.exchange) {
            throw new Error(`Market ${params.marketSlug} has no venue exchange address`);
        }

        // Map BUY/SELL to SDK's Side enum
        const side = params.side === 'BUY' ? Side.BUY : Side.SELL;

        // Determine order type - default to GTC (limit orders)
        // FOK (Fill-or-Kill) can be used for market orders
        const orderType = params.type === 'market' ? OrderType.FOK : OrderType.GTC;

        // Create order using SDK
        // The SDK handles:
        // - EIP-712 signing
        // - Amount calculations (converting to proper decimals)
        // - API request formatting
        const order = await this.orderClient.createOrder({
            tokenId: params.outcomeId,
            price: params.price,
            size: params.amount,
            side: side,
            orderType: orderType,
            marketSlug: params.marketSlug,
        });

        return order;
    }

    /**
     * Cancel a specific order by ID.
     */
    async cancelOrder(orderId: string) {
        return await this.orderClient.cancel(orderId);
    }

    /**
     * Cancel all orders for a specific market.
     */
    async cancelAllOrders(marketSlug: string) {
        return await this.orderClient.cancelAll(marketSlug);
    }

    /**
     * Get user orders for a specific market.
     * @param marketSlug - The market slug
     * @param statuses - Optional filter by order status
     */
    async getOrders(
        marketSlug: string,
        statuses?: ('LIVE' | 'MATCHED' | 'CANCELLED' | 'FILLED')[]
    ) {
        // The SDK's OrderClient may not have a direct method for this
        // Use the HTTP client directly to fetch user orders
        const params: any = {};
        if (statuses && statuses.length > 0) {
            params.statuses = statuses;
        }

        const response = await this.httpClient.get(`/markets/${marketSlug}/user-orders`, params);
        return response.orders || [];
    }

    /**
     * Get the signer's wallet address.
     */
    getAddress(): string {
        return this.signer.address;
    }

    /**
     * Get the underlying HTTP client for direct API access.
     */
    getHttpClient(): HttpClient {
        return this.httpClient;
    }

    /**
     * Get the underlying OrderClient for advanced order operations.
     */
    getOrderClient(): OrderClient {
        return this.orderClient;
    }

    /**
     * Get the underlying MarketFetcher for advanced market queries.
     */
    getMarketFetcher(): MarketFetcher {
        return this.marketFetcher;
    }

    /**
     * Clear the market cache.
     */
    clearMarketCache(): void {
        this.marketCache = {};
    }

    async getBalance(): Promise<number> {
        // USDC on Base
        const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
        const ABI = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
        
        // Use a public RPC for Base
        const provider = new providers.JsonRpcProvider('https://mainnet.base.org', {
            chainId: 8453,
            name: 'base',
        });
        const contract = new Contract(USDC_ADDRESS, ABI, provider);

        const balance = await contract.balanceOf(this.signer.address);
        const decimals = await contract.decimals(); // Should be 6

        return parseFloat(utils.formatUnits(balance, decimals));
    }
}
