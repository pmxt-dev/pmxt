import { createClobClient } from '@prob/clob';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { ExchangeCredentials } from '../../BaseExchange';
import { PROBABLE_CHAIN_ID, PROBABLE_TESTNET_CHAIN_ID } from './config';
import { AuthNonceResponse, AuthLoginResponse } from '../../router/types';

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
 * Get a nonce from Probable.
 * Uses the implicit API endpoint 'getPublicApiV1AuthNonce'.
 */
export async function getAuthNonce(
    walletAddress: string,
    callApi: Function
): Promise<AuthNonceResponse> {
    try {
        const response = await callApi('getPublicApiV1AuthNonce', { address: walletAddress });
        return {
            nonce: response.nonce,
            messageToSign: response.message || response.messageToSign,
            expiresAt: response.expiresAt,
        };
    } catch (error: any) {
        throw new Error(`Failed to get Probable auth nonce: ${error.message}`);
    }
}

/**
 * Login to Probable with signature.
 * Uses the implicit API endpoint 'postPublicApiV1AuthLogin'.
 */
export async function loginWithSignature(
    walletAddress: string,
    signature: string,
    nonce: string,
    callApi: Function
): Promise<AuthLoginResponse> {
    try {
        const response = await callApi('postPublicApiV1AuthLogin', {
            address: walletAddress,
            signature,
            nonce,
        });
        return {
            apiKey: response.apiKey,
            apiSecret: response.apiSecret,
            passphrase: response.passphrase,
            expiresAt: response.expiresAt,
            active: true,
        };
    } catch (error: any) {
        throw new Error(`Failed to login to Probable: ${error.message}`);
    }
}

/**
 * Logout from Probable.
 * Uses the implicit API endpoint 'postPublicApiV1AuthLogout'.
 */
export async function logout(callApi: Function): Promise<void> {
    try {
        await callApi('postPublicApiV1AuthLogout', {});
    } catch (error: any) {
        // Log but don't throw - logout should be best-effort
        console.warn(`Failed to logout from Probable: ${error.message}`);
    }
}

/**
 * Verify L1 signature.
 * Uses the implicit API endpoint 'postPublicApiV1AuthVerifyL1'.
 */
export async function verifyL1(
    walletAddress: string,
    signature: string,
    callApi: Function
): Promise<boolean> {
    try {
        const response = await callApi('postPublicApiV1AuthVerifyL1', {
            address: walletAddress,
            signature,
        });
        return response.verified === true;
    } catch (error: any) {
        return false;
    }
}

/**
 * Verify L2 signature.
 * Uses the implicit API endpoint 'postPublicApiV1AuthVerifyL2'.
 */
export async function verifyL2(
    walletAddress: string,
    signature: string,
    callApi: Function
): Promise<boolean> {
    try {
        const response = await callApi('postPublicApiV1AuthVerifyL2', {
            address: walletAddress,
            signature,
        });
        return response.verified === true;
    } catch (error: any) {
        return false;
    }
}