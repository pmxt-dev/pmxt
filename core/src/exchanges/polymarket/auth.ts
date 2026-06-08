import { ClobClient } from '@polymarket/clob-client-v2';
import type { ApiKeyCreds } from '@polymarket/clob-client-v2';
import { createWalletClient, http } from 'viem';
import type { WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import axios from 'axios';
import { ExchangeCredentials } from '../../BaseExchange';
import { logger } from '../../utils/logger';
import { POLYMARKET_CHAIN_ID } from './config';
import { polymarketErrorMapper } from './errors';

const DEFAULT_POLYMARKET_HOST = process.env.POLYMARKET_CLOB_URL || 'https://clob.polymarket.com';

// Polymarket CLOB signature types — determines how the CLOB API
// resolves the on-chain address holding the user's funds.
const SIG_TYPE_EOA = 0;
const SIG_TYPE_POLY_PROXY = 1;
const SIG_TYPE_GNOSIS_SAFE = 2;
const SIG_TYPE_POLY_1271 = 3;  // Deposit wallet (ERC-1271, recommended for new API users)

/**
 * Manages Polymarket authentication and CLOB client initialization.
 * Handles both L1 (wallet-based) and L2 (API credentials) authentication.
 */
export class PolymarketAuth {
    private credentials: ExchangeCredentials;
    private signer?: WalletClient;
    private signerAddress?: string;
    private clobClient?: ClobClient;
    private apiCreds?: ApiKeyCreds;
    private discoveredProxyAddress?: string;
    private discoveredSignatureType?: number;
    readonly host: string;

    constructor(credentials: ExchangeCredentials) {
        this.credentials = credentials;
        this.host = credentials.baseUrl || DEFAULT_POLYMARKET_HOST;

        if (!credentials.privateKey) {
            throw new Error('Polymarket requires a privateKey for authentication');
        }

        // Initialize the signer
        let privateKey = credentials.privateKey;
        // Fix for common .env issue where newlines are escaped
        if (privateKey.includes('\\n')) {
            privateKey = privateKey.replace(/\\n/g, '\n');
        }

        // Validate key format. Solana wallets (e.g. Phantom) export
        // base58 ed25519 keys which are not compatible with EVM.
        const stripped = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
        if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
            throw new Error(
                'Invalid private key format. Polymarket requires a 32-byte hex EVM private key ' +
                '(e.g. 0xabc123...). If you exported this key from Phantom or another Solana wallet, ' +
                'note that Solana keys are not compatible with EVM. Import your recovery phrase ' +
                'into an EVM wallet (e.g. MetaMask) to obtain the correct key.'
            );
        }

        const hexKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
        const account = privateKeyToAccount(hexKey);
        this.signerAddress = account.address;
        this.signer = createWalletClient({
            account,
            chain: polygon,
            transport: http(),
        });
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
        const l1Client = new ClobClient({
            host: this.host,
            chain: POLYMARKET_CHAIN_ID,
            signer: this.signer,
        });

        // Robust derivation strategy:
        // 1. Try to DERIVE existing credentials first (most common case).
        // 2. If that fails (e.g. 404 or 400), try to CREATE new ones.

        let creds: ApiKeyCreds | undefined;

        try {
            // console.log('Trying to derive existing API key...');
            creds = await l1Client.deriveApiKey();
            if (!creds || !creds.key || !creds.secret || !creds.passphrase) {
                // If derived creds are missing, throw to trigger catch -> create
                throw new Error("Derived credentials are incomplete/empty");
            }
        } catch (deriveError: any) {
            logger.info('API key derivation failed, creating new key', { error: deriveError.message || String(deriveError) });
            try {
                creds = await l1Client.createApiKey();
            } catch (createError: any) {
                throw polymarketErrorMapper.mapError(createError);
            }
        }

        if (!creds || !creds.key || !creds.secret || !creds.passphrase) {
            logger.error('Incomplete credentials after derivation', { hasKey: !!creds?.key, hasSecret: !!creds?.secret, hasPassphrase: !!creds?.passphrase });
            throw new Error('Authentication failed: Derived credentials are incomplete.');
        }

        // console.log(`[PolymarketAuth] Successfully obtained API credentials for key ${creds.key.substring(0, 8)}...`);
        this.apiCreds = creds;
        return creds;
    }

    /**
     * Discover the proxy address and signature type for the signer.
     */
    async discoverProxy(): Promise<{ proxyAddress: string; signatureType: number }> {
        if (this.discoveredProxyAddress) {
            return {
                proxyAddress: this.discoveredProxyAddress,
                signatureType: this.discoveredSignatureType ?? SIG_TYPE_EOA
            };
        }

        if (!this.signerAddress) {
            throw new Error('[polymarket] Wallet not initialized — privateKey required before discoverProxy()');
        }
        const address = this.signerAddress;
        try {
            // Polymarket Data API / Profiles endpoint
            // Path-based: https://data-api.polymarket.com/profiles/0x...
            const dataApiUrl = process.env.POLYMARKET_DATA_URL || 'https://data-api.polymarket.com';
            const response = await axios.get(`${dataApiUrl}/profiles/${address}`, {
                headers: { 'User-Agent': 'pmxt (https://github.com/pmxt-dev/pmxt)' },
                timeout: 10_000,
            });
            const profile = response.data;
            // console.log(`[PolymarketAuth] Profile for ${address}:`, JSON.stringify(profile));

            if (profile && profile.proxyAddress) {
                this.discoveredProxyAddress = profile.proxyAddress;
                // Determine signature type. 
                // Polymarket usually uses 1 for their own proxy and 2 for Gnosis Safe (which is what their new profiles use).
                // If it's a proxy address but we don't know the type, 1 is a safe default for Polymarket.
                this.discoveredSignatureType = profile.isGnosisSafe ? SIG_TYPE_GNOSIS_SAFE : SIG_TYPE_POLY_PROXY;

                // console.log(`[PolymarketAuth] Auto-discovered proxy for ${address}: ${this.discoveredProxyAddress} (Type: ${this.discoveredSignatureType})`);
                if (!this.discoveredProxyAddress || this.discoveredSignatureType === undefined) {
                    throw new Error('[polymarket] Proxy discovery incomplete — missing proxyAddress or signatureType');
                }
                return {
                    proxyAddress: this.discoveredProxyAddress,
                    signatureType: this.discoveredSignatureType
                };
            }
        } catch (error: unknown) {
            logger.warn(`Proxy auto-discovery failed for ${address}`, { error: error instanceof Error ? error.message : String(error) });
        }

        // Fallback to EOA if discovery fails
        return {
            proxyAddress: address,
            signatureType: SIG_TYPE_EOA
        };
    }

    /**
     * Maps human-readable signature type names to their numeric values.
     */
    private mapSignatureType(type: number | string | undefined | null): number {
        if (type === undefined || type === null) return SIG_TYPE_EOA;
        if (typeof type === 'number') return type;

        const normalized = type.toLowerCase().replace(/[^a-z0-9]/g, '');
        switch (normalized) {
            case 'eoa':
                return SIG_TYPE_EOA;
            case 'polyproxy':
            case 'polymarketproxy':
                return SIG_TYPE_POLY_PROXY;
            case 'gnosissafe':
            case 'safe':
                return SIG_TYPE_GNOSIS_SAFE;
            case 'poly1271':
            case '1271':
            case 'depositwallet':
                return SIG_TYPE_POLY_1271;
            default:
                const parsed = parseInt(normalized);
                return isNaN(parsed) ? SIG_TYPE_EOA : parsed;
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

        // 1. Determine proxy and signature type.
        //
        // Priority order:
        //   1. Discovery (Polymarket Data API) — authoritative when it works
        //   2. User-provided signatureType — respected as explicit override
        //   3. Default: POLY_1271 (3) — deposit wallet, the V2 standard
        const sigTypeProvided =
            this.credentials.signatureType !== undefined && this.credentials.signatureType !== null;
        let proxyAddress = this.credentials.funderAddress || undefined;
        let signatureType: number | undefined = sigTypeProvided
            ? this.mapSignatureType(this.credentials.signatureType)
            : undefined;

        // Run discovery when we need to fill in missing values.
        if (!proxyAddress || signatureType === undefined) {
            let discoverySucceeded = false;
            try {
                const discovered = await this.discoverProxy();
                discoverySucceeded =
                    !!this.discoveredProxyAddress &&
                    this.discoveredSignatureType !== undefined;
                if (!proxyAddress) {
                    proxyAddress = discovered.proxyAddress;
                }
                if (signatureType === undefined && discoverySucceeded) {
                    signatureType = discovered.signatureType;
                }
            } catch (err: unknown) {
                // Discovery failure — fall through to default (Gnosis Safe) below.
                // A network/HTTP error here does not block trading; we just lose
                // the ability to auto-detect signatureType.
                logger.warn('Signature-type discovery failed; defaulting to Gnosis Safe', {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        if (signatureType === undefined) {
            // Neither user nor discovery provided a value. Default to
            // Gnosis Safe — the standard Polymarket wallet type.
            signatureType = SIG_TYPE_GNOSIS_SAFE;
        }

        // Get API credentials (L1 auth)
        const apiCreds = await this.getApiCredentials();

        // Final addresses
        if (!this.signerAddress) {
            throw new Error('[polymarket] Wallet not initialized — privateKey required before getClobClient()');
        }
        const signerAddress = this.signerAddress;
        const finalProxyAddress: string = proxyAddress || signerAddress;
        const finalSignatureType: number = signatureType;

        // Create L2-authenticated client
        // console.log(`[PolymarketAuth] Initializing ClobClient | Signer: ${signerAddress} | Funder: ${finalProxyAddress} | SigType: ${finalSignatureType}`);

        this.clobClient = new ClobClient({
            host: this.host,
            chain: POLYMARKET_CHAIN_ID,
            signer: this.signer,
            creds: apiCreds,
            signatureType: finalSignatureType,
            funderAddress: finalProxyAddress,
        });

        return this.clobClient;
    }

    /**
     * Get the funder address (Proxy) if available.
     * Note: This is an async-safe getter if discovery is needed.
     */
    async getEffectiveFunderAddress(): Promise<string> {
        if (this.credentials.funderAddress) {
            return this.credentials.funderAddress;
        }
        const discovered = await this.discoverProxy();
        return discovered.proxyAddress;
    }

    /**
     * Synchronous getter for credentials funder address.
     */
    getFunderAddress(): string {
        if (this.credentials.funderAddress) {
            return this.credentials.funderAddress;
        }
        if (!this.signerAddress) {
            throw new Error('[polymarket] Wallet not initialized — no funderAddress or signerAddress available');
        }
        return this.signerAddress;
    }

    /**
     * Get the signer's address.
     */
    getAddress(): string {
        if (!this.signerAddress) {
            throw new Error('[polymarket] Wallet not initialized — privateKey required');
        }
        return this.signerAddress;
    }

    /**
     * Reset cached credentials and client (useful for testing or credential rotation).
     */
    reset(): void {
        this.apiCreds = undefined;
        this.clobClient = undefined;
    }
}
