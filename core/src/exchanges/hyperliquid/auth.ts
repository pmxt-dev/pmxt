import { Wallet, utils } from 'ethers';
import { Packr } from 'msgpackr';
import { ExchangeCredentials } from '../../BaseExchange';
import { AuthenticationError } from '../../errors';
import { EXCHANGE_CHAIN_ID } from './config';

// Standard msgpack encoder — variableMapSize ensures fixmap/fixarray encoding
// which matches the Python/Rust msgpack libraries that Hyperliquid's server uses.
const packr = new Packr({ useRecords: false, variableMapSize: true });

// ----------------------------------------------------------------------------
// EIP-712 domain and types for Hyperliquid L1 action signing
// ----------------------------------------------------------------------------

const EIP712_DOMAIN = {
    name: 'Exchange',
    version: '1',
    chainId: EXCHANGE_CHAIN_ID,
    verifyingContract: '0x0000000000000000000000000000000000000000',
};

const AGENT_TYPES = {
    Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
    ],
};

// ----------------------------------------------------------------------------
// Signature type
// ----------------------------------------------------------------------------

export interface HyperliquidSignature {
    r: string;
    s: string;
    v: number;
}

// ----------------------------------------------------------------------------
// msgpack helpers -- Hyperliquid requires int64 encoding for large integers
// ----------------------------------------------------------------------------

function convertLargeInts(obj: unknown): unknown {
    if (typeof obj === 'number' && Number.isInteger(obj) &&
        (obj >= 0x100000000 || obj < -0x80000000)) {
        return BigInt(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(convertLargeInts);
    }
    if (typeof obj === 'object' && obj !== null) {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(obj)) {
            if (val !== undefined) {
                result[key] = convertLargeInts(val);
            }
        }
        return result;
    }
    return obj;
}

// ponytail: msgpackr encodes positive BigInts as int64 (0xd3); HL's server uses
// Python's msgpack which encodes the same value as uint64 (0xcf). Post-process the
// packed bytes to flip d3 → cf for non-negative payloads. HL actions never carry
// negative integers (oids, nonces, asset ids are all >= 0), so this is safe.
function fixInt64ToUint64(bytes: Uint8Array): Uint8Array {
    const out = Buffer.from(bytes);
    for (let i = 0; i < out.length - 8; i++) {
        if (out[i] === 0xd3 && (out[i + 1] & 0x80) === 0) {
            out[i] = 0xcf;
        }
    }
    return out;
}

// ----------------------------------------------------------------------------
// Action hash -- constructs the connectionId for the phantom agent
// ----------------------------------------------------------------------------

function computeActionHash(
    action: Record<string, unknown>,
    vaultAddress: string | null,
    nonce: number,
): string {
    // 1. msgpack-encode the action; coerce positive int64 to uint64 to match HL's server (Python msgpack)
    const actionBytes = fixInt64ToUint64(packr.pack(convertLargeInts(action)));

    // 2. nonce as 8 bytes big-endian
    const nonceBytes = Buffer.alloc(8);
    nonceBytes.writeBigUInt64BE(BigInt(nonce));

    // 3. vault address marker
    const parts: Buffer[] = [Buffer.from(actionBytes), nonceBytes];

    if (vaultAddress) {
        parts.push(Buffer.from([0x01]));
        parts.push(Buffer.from(vaultAddress.replace('0x', ''), 'hex'));
    } else {
        parts.push(Buffer.from([0x00]));
    }

    // 4. keccak256 of concatenated bytes
    return utils.keccak256(Buffer.concat(parts));
}

// ----------------------------------------------------------------------------
// Price/size formatting -- must match Hyperliquid's wire format
// ----------------------------------------------------------------------------

export function floatToWire(x: number): string {
    const rounded = x.toFixed(8);
    if (Math.abs(parseFloat(rounded) - x) >= 1e-12) {
        throw new Error(`floatToWire causes rounding: ${x}`);
    }
    return parseFloat(rounded).toString();
}

// ----------------------------------------------------------------------------
// Auth class
// ----------------------------------------------------------------------------

export class HyperliquidAuth {
    private readonly wallet: Wallet;
    private readonly isMainnet: boolean;

    constructor(credentials: ExchangeCredentials, testnet: boolean) {
        if (!credentials.privateKey) {
            throw new AuthenticationError(
                'Hyperliquid trading requires a privateKey for EIP-712 signing.',
                'Hyperliquid',
            );
        }

        let privateKey = credentials.privateKey;
        if (privateKey.includes('\\n')) {
            privateKey = privateKey.replace(/\\n/g, '\n');
        }

        const stripped = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
        if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
            throw new AuthenticationError(
                'Invalid private key format. Hyperliquid requires a 32-byte hex EVM private key (e.g. 0xabc123...).',
                'Hyperliquid',
            );
        }

        this.wallet = new Wallet(privateKey);
        this.isMainnet = !testnet;
    }

    getAddress(): string {
        return this.wallet.address;
    }

    /**
     * Sign an L1 action using the phantom agent EIP-712 scheme.
     *
     * Flow:
     *   1. msgpack-encode the action
     *   2. Append nonce (8 bytes BE) + vault marker
     *   3. keccak256 -> connectionId
     *   4. EIP-712 sign {source, connectionId} with domain "Exchange"
     */
    async signL1Action(
        action: Record<string, unknown>,
        vaultAddress: string | null = null,
        nonce: number = Date.now(),
    ): Promise<{ signature: HyperliquidSignature; nonce: number }> {
        const connectionId = computeActionHash(action, vaultAddress, nonce);

        const message = {
            source: this.isMainnet ? 'a' : 'b',
            connectionId,
        };

        // ethers v5 uses _signTypedData (underscore prefix)
        const sig = await this.wallet._signTypedData(EIP712_DOMAIN, AGENT_TYPES, message);
        const split = utils.splitSignature(sig);

        return {
            signature: {
                r: split.r,
                s: split.s,
                v: split.v,
            },
            nonce,
        };
    }

    /**
     * Build and sign a complete exchange request body.
     */
    async signExchangeRequest(
        action: Record<string, unknown>,
        vaultAddress: string | null = null,
    ): Promise<Record<string, unknown>> {
        const nonce = Date.now();
        const { signature } = await this.signL1Action(action, vaultAddress, nonce);

        return {
            action,
            nonce,
            signature,
            vaultAddress,
        };
    }
}
