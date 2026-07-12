import { ExchangeCredentials } from '../../BaseExchange';
import { AuthenticationError } from '../../errors';
import { type Hex, type LocalAccount } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface HunchCredentials extends ExchangeCredentials {
    /** EOA private key that pays the x402 USDC authorization (Base). */
    privateKey?: string;
    /** Wallet address for keyless reads (positions/balance). Derived from
     *  `privateKey` when present; required on its own for read-only use. */
    walletAddress?: string;
    /** Optional base URL override (defaults to https://www.playhunch.xyz). */
    baseUrl?: string;
}

/**
 * Hunch auth holder.
 *
 * Reads are KEYLESS — `getHeaders()` returns only a JSON content type, and the
 * read methods that need a wallet (positions/balance) take the address as a
 * query param, not an auth header.
 *
 * The money path (createOrder) signs an EIP-3009 `transferWithAuthorization`
 * with the wallet's viem `LocalAccount`, obtained lazily from `privateKey`.
 */
export class HunchAuth {
    private readonly credentials: HunchCredentials;
    private account?: LocalAccount;

    constructor(credentials: HunchCredentials) {
        this.credentials = credentials;
    }

    /** Reads carry no auth — the wallet IS the account (passed as a param). */
    getHeaders(): Record<string, string> {
        return { 'Content-Type': 'application/json' };
    }

    /** The wallet address (explicit, or derived from the private key). */
    get walletAddress(): string | undefined {
        if (this.credentials.walletAddress) return this.credentials.walletAddress;
        const derived = this.deriveAddress();
        return derived;
    }

    get hasSigner(): boolean {
        return !!this.credentials.privateKey;
    }

    /** Lazily build (and cache) the viem account that signs the x402 payment. */
    getAccount(): LocalAccount {
        if (this.account) return this.account;
        if (!this.credentials.privateKey) {
            throw new AuthenticationError(
                'Placing a real Hunch bet requires a privateKey to sign the x402 USDC ' +
                    'payment. Initialize HunchExchange with { privateKey }.',
                'Hunch',
            );
        }
        this.account = privateKeyToAccount(this.normalizePk(this.credentials.privateKey));
        return this.account;
    }

    requireWalletAddress(method: string): string {
        const addr = this.walletAddress;
        if (!addr) {
            throw new AuthenticationError(
                `${method} requires a wallet address. Pass { walletAddress } or { privateKey } in credentials.`,
                'Hunch',
            );
        }
        return addr;
    }

    private deriveAddress(): string | undefined {
        if (!this.credentials.privateKey) return undefined;
        return privateKeyToAccount(this.normalizePk(this.credentials.privateKey)).address;
    }

    private normalizePk(pk: string): Hex {
        return (pk.startsWith('0x') ? pk : `0x${pk}`) as Hex;
    }
}
