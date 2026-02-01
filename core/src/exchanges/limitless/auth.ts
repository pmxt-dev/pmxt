import { ClobClient } from '@polymarket/clob-client';
import type { ApiKeyCreds } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { ExchangeCredentials } from '../../BaseExchange';

const LIMITLESS_HOST = 'https://api.limitless.exchange';
const BASE_CHAIN_ID = 8453;

/**
 * Manages Limitless authentication and API client initialization.
 * Handles authentication for both public data and private trading operations.
 */
export class LimitlessAuth {
    private credentials: ExchangeCredentials;
    private signer?: Wallet;
    private clobClient?: ClobClient;
    private apiCreds?: ApiKeyCreds;

    constructor(credentials: ExchangeCredentials) {
        this.credentials = credentials;

        if (!credentials.privateKey) {
            throw new Error('Limitless requires a privateKey for authentication');
        }

        // Initialize the signer
        this.signer = new Wallet(credentials.privateKey);
    }

    /**
     * Get or create API credentials using L1 authentication.
     * This uses the private key to derive/create API credentials.
     */
    async getApiCredentials(): Promise<ApiKeyCreds> {
        // Return cached credentials if available
        if (this.apiCreds) {
            return this.apiCreds;
        }

        // If credentials were provided, use them
        if (this.credentials.apiKey && this.credentials.apiSecret && this.credentials.passphrase) {
            this.apiCreds = {
                key: this.credentials.apiKey,
                secret: this.credentials.apiSecret,
                passphrase: this.credentials.passphrase,
            };
            return this.apiCreds;
        }

        // Otherwise, derive/create them using L1 auth
        const l1Client = new ClobClient(
            LIMITLESS_HOST,
            BASE_CHAIN_ID as any,
            this.signer
        );

        // Robust derivation strategy:
        // 1. Try to DERIVE existing credentials first (most common case).
        // 2. If that fails (e.g. 404 or 400), try to CREATE new ones.

        let creds: ApiKeyCreds | undefined;

        try {
            // console.log('Trying to derive existing API key...');
            creds = await l1Client.deriveApiKey();
        } catch (deriveError: any) {
            // console.log('Derivation failed, trying to create new API key...');
            try {
                creds = await l1Client.createApiKey();
            } catch (createError: any) {
                console.error('Failed to both derive and create API key:', createError?.message || createError);
                throw new Error('Authentication failed: Could not create or derive API key.');
            }
        }

        if (!creds) {
            throw new Error('Authentication failed: Credentials are empty.');
        }

        this.apiCreds = creds;
        return creds;
    }

    /**
     * Maps human-readable signature type names to their numeric values.
     */
    private mapSignatureType(type: number | string | undefined | null): number {
        if (type === undefined || type === null) return 0;
        if (typeof type === 'number') return type;

        const normalized = type.toLowerCase().replace(/[^a-z0-9]/g, '');
        switch (normalized) {
            case 'eoa':
                return 0;
            case 'polyproxy':
            case 'polymarketproxy':
                return 1;
            case 'gnosissafe':
            case 'safe':
                return 2;
            default:
                const parsed = parseInt(normalized);
                return isNaN(parsed) ? 0 : parsed;
        }
    }

    /**
     * Get an authenticated CLOB client for L2 operations (trading).
     * This client can place orders, cancel orders, query positions, etc.
     */
    async getClobClient(): Promise<ClobClient> {
        // Return cached client if available
        if (this.clobClient) {
            return this.clobClient;
        }

        // Get API credentials (L1 auth)
        const apiCreds = await this.getApiCredentials();

        // Determine signature type (default to EOA = 0)
        const signatureType = this.mapSignatureType(this.credentials.signatureType);

        // Determine funder address (defaults to signer's address)
        const funderAddress = this.credentials.funderAddress ?? this.signer!.address;

        // Create L2-authenticated client
        this.clobClient = new ClobClient(
            LIMITLESS_HOST,
            BASE_CHAIN_ID as any,
            this.signer,
            apiCreds,
            signatureType as any,
            funderAddress
        );



        return this.clobClient;
    }

    /**
     * Get the signer's address.
     */
    getAddress(): string {
        return this.signer!.address;
    }

    /**
     * Reset cached credentials and client (useful for testing or credential rotation).
     */
    reset(): void {
        this.apiCreds = undefined;
        this.clobClient = undefined;
    }
}
