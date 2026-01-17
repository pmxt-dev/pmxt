import axios from 'axios';
import { PolymarketExchange } from '../../../src/exchanges/polymarket';
import { PolymarketWebSocketManager } from '../../../src/exchanges/polymarket/websocket';
import { OrderBook } from '../../../src/types';

/**
 * Polymarket watchOrderBook Test
 * 
 * What: Tests real-time orderbook streaming via WebSocket.
 * Why: WebSocket streaming is critical for high-frequency trading strategies.
 * How: Mocks WebSocket connection and verifies async generator behavior.
 */

jest.mock('axios');
jest.mock('../../../src/exchanges/polymarket/websocket');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const MockedWebSocketManager = PolymarketWebSocketManager as jest.MockedClass<typeof PolymarketWebSocketManager>;

describe('PolymarketExchange - watchOrderBook', () => {
    let exchange: PolymarketExchange;
    let mockWsManager: jest.Mocked<PolymarketWebSocketManager>;

    beforeEach(() => {
        exchange = new PolymarketExchange();
        jest.clearAllMocks();

        // Create mock WebSocket manager
        mockWsManager = {
            watchOrderBook: jest.fn(),
            setInitialSnapshot: jest.fn(),
            connect: jest.fn(),
            disconnect: jest.fn(),
            isConnected: jest.fn().mockReturnValue(true),
            cleanup: jest.fn()
        } as any;

        MockedWebSocketManager.mockImplementation(() => mockWsManager);
    });

    it('should fetch initial snapshot before streaming', async () => {
        const initialOrderbook: OrderBook = {
            bids: [{ price: 0.52, size: 100 }],
            asks: [{ price: 0.53, size: 150 }],
            timestamp: 1000
        };

        mockedAxios.get.mockResolvedValue({
            data: {
                bids: [{ price: '0.52', size: '100' }],
                asks: [{ price: '0.53', size: '150' }],
                timestamp: '2025-01-08T12:00:00Z'
            }
        });

        // Mock async generator for WebSocket updates
        const updates: OrderBook[] = [
            { bids: [{ price: 0.52, size: 110 }], asks: [{ price: 0.53, size: 150 }], timestamp: 2000 },
            { bids: [{ price: 0.52, size: 120 }], asks: [{ price: 0.53, size: 150 }], timestamp: 3000 }
        ];

        let updateIndex = 0;
        mockWsManager.watchOrderBook.mockImplementation(async function* () {
            for (const update of updates) {
                yield update;
            }
        });

        const tokenId = 'token123456789';
        const generator = exchange.watchOrderBook(tokenId);

        // Get initial snapshot
        const first = await generator.next();
        expect(first.value).toBeDefined();
        expect(first.value.bids).toBeDefined();
        expect(mockWsManager.setInitialSnapshot).toHaveBeenCalledWith(tokenId, expect.any(Object));

        // Get first update
        const second = await generator.next();
        expect(second.value).toEqual(updates[0]);

        // Get second update
        const third = await generator.next();
        expect(third.value).toEqual(updates[1]);
    });

    it('should yield initial snapshot first', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                bids: [{ price: '0.52', size: '100' }],
                asks: [{ price: '0.53', size: '150' }]
            }
        });

        mockWsManager.watchOrderBook.mockImplementation(async function* () {
            // No updates, just end
        });

        const generator = exchange.watchOrderBook('token123');
        const first = await generator.next();

        expect(first.value).toBeDefined();
        expect(first.value.bids).toHaveLength(1);
        expect(first.value.asks).toHaveLength(1);
    });

    it('should handle WebSocket errors gracefully', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                bids: [{ price: '0.52', size: '100' }],
                asks: [{ price: '0.53', size: '150' }]
            }
        });

        mockWsManager.watchOrderBook.mockImplementation(async function* () {
            throw new Error('WebSocket error');
        });

        const generator = exchange.watchOrderBook('token123');
        
        // Should yield initial snapshot
        const first = await generator.next();
        expect(first.value).toBeDefined();

        // Should throw error on next iteration
        await expect(generator.next()).rejects.toThrow('WebSocket error');
    });

    it('should reuse WebSocket manager instance', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { bids: [], asks: [] }
        });

        mockWsManager.watchOrderBook.mockImplementation(async function* () {
            // Empty generator
        });

        // First call
        const gen1 = exchange.watchOrderBook('token1');
        await gen1.next();

        // Second call - should reuse same manager
        const gen2 = exchange.watchOrderBook('token2');
        await gen2.next();

        // Should only create one WebSocket manager
        expect(MockedWebSocketManager).toHaveBeenCalledTimes(1);
    });

    it('should handle empty initial orderbook', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { bids: [], asks: [] }
        });

        mockWsManager.watchOrderBook.mockImplementation(async function* () {
            // Empty generator
        });

        const generator = exchange.watchOrderBook('token123');
        const first = await generator.next();

        expect(first.value.bids).toEqual([]);
        expect(first.value.asks).toEqual([]);
    });
});
