import { ExchangeCredentials } from '../../BaseExchange';
import { AuthenticationError } from '../../errors';
import {
    createWalletClient, createPublicClient, http,
    type WalletClient, type PublicClient, type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';

export interface RainCredentials extends ExchangeCredentials {
    privateKey?: string;
    walletAddress?: string;
    subgraphUrl?: string;
    subgraphApiKey?: string;
    wsRpcUrl?: string;
    rpcUrl?: string;
    environment?: 'development' | 'stage' | 'production';
}

const DEFAULT_ARBITRUM_RPC = 'https://arb1.arbitrum.io/rpc';

export class RainAuth {
    readonly creds: RainCredentials;
    private wallet?: WalletClient;
    private publicClient?: PublicClient;
    private signerAddress?: `0x${string}`;

    constructor(creds: RainCredentials) {
        this.creds = creds;
    }

    get walletAddress(): string | undefined {
        return this.creds.walletAddress ?? this.deriveAddress();
    }

    get privateKey(): string | undefined {
        return this.creds.privateKey;
    }

    private deriveAddress(): `0x${string}` | undefined {
        if (this.signerAddress) return this.signerAddress;
        if (!this.creds.privateKey) return undefined;
        const pk = this.creds.privateKey.startsWith('0x')
            ? this.creds.privateKey as Hex
            : (`0x${this.creds.privateKey}` as Hex);
        this.signerAddress = privateKeyToAccount(pk).address;
        return this.signerAddress;
    }

    resolveAddress(): string | undefined {
        return this.walletAddress;
    }

    requireWalletAddress(method: string): string {
        const addr = this.resolveAddress();
        if (!addr) {
            throw new AuthenticationError(
                `${method} requires a wallet address. Pass { walletAddress } or { privateKey } in credentials.`,
                'Rain',
            );
        }
        return addr;
    }

    ensureWalletClient(): WalletClient {
        if (this.wallet) return this.wallet;
        if (!this.creds.privateKey) {
            throw new AuthenticationError(
                'Trading requires a privateKey. Initialize RainExchange with { privateKey } in credentials.',
                'Rain',
            );
        }
        const pk = this.creds.privateKey.startsWith('0x')
            ? this.creds.privateKey as Hex
            : (`0x${this.creds.privateKey}` as Hex);
        const account = privateKeyToAccount(pk);
        this.signerAddress = account.address;
        this.wallet = createWalletClient({
            account,
            chain: arbitrum,
            transport: http(this.creds.rpcUrl ?? DEFAULT_ARBITRUM_RPC),
        });
        return this.wallet;
    }

    ensurePublicClient(): PublicClient {
        if (this.publicClient) return this.publicClient;
        this.publicClient = createPublicClient({
            chain: arbitrum,
            transport: http(this.creds.rpcUrl ?? DEFAULT_ARBITRUM_RPC),
        });
        return this.publicClient;
    }
}
