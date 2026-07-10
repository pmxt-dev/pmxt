import { createClobClient } from '@prob/clob';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { ExchangeCredentials } from '../../BaseExchange';
import { PROBABLE_CHAIN_ID, PROBABLE_TESTNET_CHAIN_ID } from './config';
import { AuthNonceResponse, SessionCredentials } from '../../types';

/**
 * Manages Probable authentication and CLOB client initialization.
 * Requires a privateKey and pre-generated API key triplet (apiKey, apiSecret, passphrase).
 */
export class ProbableAuth {
    private credentials: ExchangeCredentials;
    private clobClient?: ReturnType<typeof createClobClient>;
    private walletAddress: string;

    constructor(credentials: ExchangeCredentials) {
        this.credentials = credentials;

        if (!credentials.privateKey) {
            throw new Error('Probable requires a privateKey for authentication');
        }

        if (!credentials.apiKey || !credentials.apiSecret || !credentials.passphrase) {
            throw new Error(
                'Probable requires pre-generated API credentials (apiKey, apiSecret, passphrase). ' +
                'Generate them at https://probable.markets or via the SDK.'
            );
        }

        const account = privateKeyToAccount(credentials.privateKey as `0x${string}`);
        this.walletAddress = account.address;
    }

    getClobClient(): ReturnType<typeof createClobClient> {
        if (this.clobClient) {
            return this.clobClient;
        }

        const chainId = parseInt(process.env.PROBABLE_CHAIN_ID || String(PROBABLE_CHAIN_ID), 10);
        const chain = chainId === PROBABLE_TESTNET_CHAIN_ID ? bscTestnet : bsc;

        const account = privateKeyToAccount(this.credentials.privateKey as `0x${string}`);
        const wallet = createWalletClient({
            account,
            chain,
            transport: http(),
        });

        const credential = {
            key: this.credentials.apiKey!,
            secret: this.credentials.apiSecret!,
            passphrase: this.credentials.passphrase!,
        };

        // @prob/clob may resolve a different viem copy than this package; types then
        // disagree on WalletClient. Runtime shape is identical.
        const walletForClob = wallet as any;

        if (chainId === PROBABLE_CHAIN_ID) {
            this.clobClient = createClobClient({
                chainId: PROBABLE_CHAIN_ID,
                wallet: walletForClob,
                credential,
            });
        } else {
            const baseUrl = process.env.PROBABLE_BASE_URL || 'https://market-api.probable.markets/public/api/v1';
            this.clobClient = createClobClient({
                chainId,
                baseUrl,
                wallet: walletForClob,
                credential,
            });
        }

        return this.clobClient;
    }

    getAddress(): string {
        return this.walletAddress;
    }
}

/**
 * Fetches a cryptographic nonce for EIP-712 wallet login.
 */
export async function getAuthNonce(walletAddress: string, callApi: Function): Promise<AuthNonceResponse> {
    // OperationId based on Probable's OpenAPI spec for GET /public/api/v1/auth/nonce
    const response = await callApi('getAuthNonce', { address: walletAddress });
    
    return {
        nonce: response.nonce,
        // Fallbacks based on how different versions of the spec name the message field
        messageToSign: response.message || response.messageToSign || `Sign to login: ${response.nonce}`
    };
}

/**
 * Submits the signed nonce to generate an API Key triplet.
 */
export async function loginWithSignature(
    walletAddress: string, 
    signature: string, 
    nonce: string, 
    callApi: Function
): Promise<SessionCredentials> {
    // OperationId for POST /auth/login
    const response = await callApi('postAuthLogin', { 
        address: walletAddress, 
        signature, 
        nonce 
    });
    
    return {
        apiKey: response.apiKey,
        apiSecret: response.apiSecret,
        passphrase: response.passphrase,
        expiresAt: response.expiresAt
    };
}

/**
 * Destroys the current API key session.
 */
export async function logoutSession(callApi: Function): Promise<void> {
    // OperationId for POST /auth/logout
    await callApi('postAuthLogout', {});
}