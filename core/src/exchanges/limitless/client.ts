import { HttpClient, OrderClient, OrderBuilder, OrderSigner, MarketFetcher, Side, OrderType } from '@limitless-exchange/sdk';
import { Wallet, providers, Contract } from 'ethers';
import { LIMITLESS_CHAIN_ID, LIMITLESS_RPC_URL } from './config';
import { scaledIntegerToNumber } from './utils';

const DEFAULT_LIMITLESS_API_URL = process.env.LIMITLESS_BASE_URL || 'https://api.limitless.exchange';

export interface LimitlessOrderParams {
    marketSlug: string;
    outcomeId: string; // The token ID
    side: 'BUY' | 'SELL';
    price: number; // Price in DOLLARS (e.g. 0.50)
    amount: number; // Number of shares
    type?: 'limit' | 'market';
    onBehalfOf?: number; // Limitless profile ID for delegated signing
}

export interface LimitlessClientConfig {
    httpClient: HttpClient;
    wallet?: Wallet;
    isDelegated?: boolean;
    /** Wallet address for profile lookup in delegated mode. */
    walletAddress?: string;
}

/**
 * Wrapper client for Limitless Exchange using the official SDK.
 *
 * Two modes:
 *  - Individual: wallet + OrderClient (EIP-712 signing)
 *  - Delegated:  no wallet, DelegatedOrderService (HMAC auth, server signs)
 */
export class LimitlessClient {
    private httpClient: HttpClient;
    private orderClient?: OrderClient;
    private marketFetcher: MarketFetcher;
    private signer?: Wallet;
    private readonly isDelegated: boolean;
    private walletAddress?: string;
    private cachedProfileId?: number;
    private marketCache: Record<string, any> = {};

    /** @deprecated Use the config-object constructor instead. */
    constructor(privateKey: string, apiKey: string, baseUrl?: string);
    constructor(config: LimitlessClientConfig);
    constructor(configOrKey: string | LimitlessClientConfig, apiKey?: string, baseUrl?: string) {
        if (typeof configOrKey === 'string') {
            // Legacy positional constructor: (privateKey, apiKey)
            let privateKey = configOrKey;
            if (privateKey.includes('\\n')) {
                privateKey = privateKey.replace(/\\n/g, '\n');
            }
            this.signer = new Wallet(privateKey);
            this.isDelegated = false;

            this.httpClient = new HttpClient({
                baseURL: baseUrl || DEFAULT_LIMITLESS_API_URL,
                apiKey: apiKey,
                timeout: 30000,
            });

            // ethers v5/v6 compat: SDK expects wallet.signTypedData (v6)
            const wallet = this.signer as any;
            if (!wallet.signTypedData && wallet._signTypedData) {
                wallet.signTypedData = wallet._signTypedData;
            }

            this.orderClient = new OrderClient({
                httpClient: this.httpClient,
                wallet: wallet,
            });

            this.marketFetcher = new MarketFetcher(this.httpClient);
            return;
        }

        // New config-object constructor
        const config = configOrKey;
        this.httpClient = config.httpClient;
        this.isDelegated = config.isDelegated ?? false;
        this.walletAddress = config.walletAddress;
        this.marketFetcher = new MarketFetcher(this.httpClient);

        if (!this.isDelegated && config.wallet) {
            this.signer = config.wallet;
            const wallet = this.signer as any;
            if (!wallet.signTypedData && wallet._signTypedData) {
                wallet.signTypedData = wallet._signTypedData;
            }
            this.orderClient = new OrderClient({
                httpClient: this.httpClient,
                wallet: wallet,
            });
        }
        // In delegated mode without a wallet, createOrder uses a direct
        // HTTP POST with an unsigned order payload (no SDK DelegatedOrderService
        // required — compatible with all SDK versions).
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
     * Create an order.
     *
     * - Individual mode: EIP-712 signed via OrderClient (requires private key).
     * - Delegated mode: unsigned order via DelegatedOrderService (HMAC auth).
     */
    async createOrder(params: LimitlessOrderParams) {
        const market = await this.getMarket(params.marketSlug);

        if (!market.venue || !market.venue.exchange) {
            throw new Error(`Market ${params.marketSlug} has no venue exchange address`);
        }

        const side = params.side === 'BUY' ? Side.BUY : Side.SELL;
        const orderType = params.type === 'market' ? OrderType.FOK : OrderType.GTC;

        if (this.isDelegated) {
            return this.createDelegatedOrder(params, side, orderType);
        }

        if (!this.signer) {
            throw new Error('No signer available. Provide a privateKey or use delegated signing.');
        }

        // For smart wallets: maker = smartWallet address, signer = EOA address.
        // For EOA wallets: maker = signer = wallet address.
        // The walletAddress credential indicates a smart wallet.
        const signerAddress = this.signer.address;
        const makerAddress = this.walletAddress ?? signerAddress;
        const isSmartWallet = makerAddress.toLowerCase() !== signerAddress.toLowerCase();

        if (!isSmartWallet && this.orderClient) {
            // Standard EOA flow — use the SDK's OrderClient directly.
            return this.orderClient.createOrder({
                tokenId: params.outcomeId,
                price: params.price,
                size: params.amount,
                side,
                orderType,
                marketSlug: params.marketSlug,
            });
        }

        // Smart wallet flow: build the order with maker=smartWallet, signer=EOA,
        // sign with the EOA key, and submit.
        return this.createSmartWalletOrder(params, side, orderType, market, makerAddress, signerAddress);
    }

    /**
     * Create an order for a smart wallet account.
     * maker = smart wallet address, signer = EOA address (our private key).
     */
    private async createSmartWalletOrder(
        params: LimitlessOrderParams,
        side: typeof Side.BUY | typeof Side.SELL,
        orderType: OrderType,
        market: any,
        makerAddress: string,
        signerAddress: string,
    ) {
        if (!this.walletAddress) {
            throw new Error('Smart wallet flow requires walletAddress in credentials.');
        }
        if (!this.signer) {
            throw new Error('Smart wallet flow requires a privateKey for signing.');
        }

        const profile = await this.resolveProfile();
        const feeRateBps = profile.feeRateBps ?? 100;

        // Build unsigned order with maker = smart wallet address.
        const builder = new OrderBuilder(makerAddress, feeRateBps);
        const orderArgs = orderType === OrderType.FOK
            ? { tokenId: params.outcomeId, makerAmount: params.price * params.amount, side }
            : { tokenId: params.outcomeId, price: params.price, size: params.amount, side };
        const unsignedOrder = builder.buildOrder(orderArgs as any);

        // Override signer to the EOA (different from maker for smart wallets).
        unsignedOrder.signer = signerAddress;

        // ethers v5/v6 compat shim — SDK expects signTypedData (v6).
        const wallet = this.signer as any;
        if (!wallet.signTypedData && wallet._signTypedData) {
            wallet.signTypedData = wallet._signTypedData;
        }

        // Sign with the EOA private key.
        const orderSigner = new OrderSigner(wallet);
        const signature = await orderSigner.signOrder(unsignedOrder, {
            chainId: LIMITLESS_CHAIN_ID,
            contractAddress: market.venue.exchange,
        });

        // Submit with ownerId (required by Limitless API).
        const payload = {
            order: { ...unsignedOrder, signature },
            orderType: orderType === OrderType.FOK ? 'FOK' : 'GTC',
            marketSlug: params.marketSlug,
            ownerId: profile.id,
        };

        const response = await this.httpClient.post('/orders', payload);
        return {
            order: response,
            id: response?.order?.id ?? 'unknown',
        };
    }

    /**
     * Build and submit an unsigned order via the delegated signing flow.
     * The Limitless server signs on behalf of the partner account.
     * No private key required — uses HMAC-authenticated HTTP.
     */
    /**
     * Resolve the Limitless profile ID for this account.
     * Fetched once from the public profile endpoint, then cached.
     */
    private cachedProfile?: { id: number; feeRateBps: number };

    private async resolveProfile(): Promise<{ id: number; feeRateBps: number }> {
        if (this.cachedProfile) return this.cachedProfile;

        const addr = this.walletAddress ?? this.signer?.address;
        if (!addr) {
            throw new Error('No wallet address available for profile lookup.');
        }

        const profile: any = await this.httpClient.get(`/profiles/public/${addr}`);
        const id = profile?.id;
        if (!id || !Number.isFinite(id)) {
            throw new Error(`Could not resolve Limitless profile ID for ${addr}`);
        }
        this.cachedProfile = {
            id,
            feeRateBps: profile?.rank?.feeRateBps ?? 100,
        };
        return this.cachedProfile;
    }

    private async resolveProfileId(): Promise<number> {
        return (await this.resolveProfile()).id;
    }

    /**
     * Build and submit an unsigned order via the delegated signing flow.
     * The Limitless server signs on behalf of the account.
     */
    private async createDelegatedOrder(
        params: LimitlessOrderParams,
        side: typeof Side.BUY | typeof Side.SELL,
        orderType: OrderType,
    ) {
        const profileId = params.onBehalfOf ?? await this.resolveProfileId();
        const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
        const USDC_DECIMALS = 6;

        const price = Math.round(params.price * 1_000_000) / 1_000_000;
        const size = params.amount;
        const makerAmount = Math.round(price * size * Math.pow(10, USDC_DECIMALS));
        const takerAmount = Math.round(size * Math.pow(10, USDC_DECIMALS));

        const payload = {
            order: {
                salt: Date.now() * 1000 + Math.floor(Math.random() * 1000),
                maker: ZERO_ADDRESS,
                signer: ZERO_ADDRESS,
                taker: ZERO_ADDRESS,
                tokenId: params.outcomeId,
                makerAmount: side === Side.BUY ? makerAmount : takerAmount,
                takerAmount: side === Side.BUY ? takerAmount : makerAmount,
                expiration: '0',
                nonce: 0,
                feeRateBps: 100,
                side: side === Side.BUY ? 0 : 1,
                signatureType: 0,
                price,
            },
            orderType: orderType === OrderType.FOK ? 'FOK' : 'GTC',
            marketSlug: params.marketSlug,
            ownerId: profileId,
            onBehalfOf: profileId,
        };

        const response = await this.httpClient.post('/orders', payload);

        return {
            order: response,
            id: response?.order?.id ?? 'unknown',
        };
    }

    /**
     * Cancel a specific order by ID.
     */
    async cancelOrder(orderId: string) {
        if (!this.orderClient) {
            throw new Error('[limitless] Order client not initialized -- trading credentials required');
        }
        return await this.orderClient.cancel(orderId);
    }

    /**
     * Cancel all orders for a specific market.
     */
    async cancelAllOrders(marketSlug: string) {
        if (!this.orderClient) {
            throw new Error('[limitless] Order client not initialized -- trading credentials required');
        }
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
        return this.signer?.address ?? '';
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
    getOrderClient(): OrderClient | undefined {
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
        
        const provider = new providers.StaticJsonRpcProvider(LIMITLESS_RPC_URL, {
            chainId: LIMITLESS_CHAIN_ID,
            name: 'base',
        });
        const contract = new Contract(USDC_ADDRESS, ABI, provider);

        if (!this.signer) {
            throw new Error('[limitless] Signer not initialized -- wallet private key required');
        }
        const balance = await contract.balanceOf(this.signer.address);
        const decimals = await contract.decimals(); // Should be 6

        return scaledIntegerToNumber(balance, Number(decimals));
    }
}
