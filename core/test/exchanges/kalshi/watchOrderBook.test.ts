import axios from 'axios';
import { KalshiExchange } from '../../../src/exchanges/kalshi';
import { KalshiWebSocketManager } from '../../../src/exchanges/kalshi/websocket';
import { OrderBook } from '../../../src/types';

jest.mock('axios');
jest.mock('../../../src/exchanges/kalshi/websocket');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const MockedWebSocketManager = KalshiWebSocketManager as jest.MockedClass<typeof KalshiWebSocketManager>;

describe('KalshiExchange - watchOrderBook', () => {
    let exchange: KalshiExchange;
    let mockWsManager: jest.Mocked<KalshiWebSocketManager>;
    const mockCredentials = {
        apiKey: 'test-api-key',
        privateKey: 'test-private-key'
    };

    beforeEach(() => {
        exchange = new KalshiExchange(mockCredentials);
        jest.clearAllMocks();

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
            asks: [{ price: 0.48, size: 150 }],
            timestamp: 1000
        };

        mockedAxios.get.mockResolvedValue({
            data: {
                orderbook: {
                    yes: [[52, 100]],  // price in cents, size
                    no: [[48, 150]]    // price in cents, size
                }
            }
        });

        const updates: OrderBook[] = [
            { bids: [{ price: 0.52, size: 110 }], asks: [{ price: 0.48, size: 150 }], timestamp: 2000 },
            { bids: [{ price: 0.53, size: 120 }], asks: [{ price: 0.47, size: 140 }], timestamp: 3000 }
        ];

        mockWsManager.watchOrderBook.mockImplementation(async function* () {
            for (const update of updates) {
                yield update;
            }
        });

        const ticker = 'FED-25JAN';
        const generator = exchange.watchOrderBook(ticker);

        const first = await generator.next();
        expect(first.value).toBeDefined();
        expect(first.value.bids).toBeDefined();
        expect(mockWsManager.setInitialSnapshot).toHaveBeenCalledWith(ticker, expect.any(Object));

        const second = await generator.next();
        expect(second.value).toEqual(updates[0]);

        const third = await generator.next();
        expect(third.value).toEqual(updates[1]);
    });

    it('should yield initial snapshot first', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                orderbook: {
                    yes: [[52, 100]],
                    no: [[48, 150]]
                }
            }
        });

        mockWsManager.watchOrderBook.mockImplementation(async function* () {
        });

        const generator = exchange.watchOrderBook('FED-25JAN');
        const first = await generator.next();

        expect(first.value).toBeDefined();
        expect(first.value.bids).toHaveLength(1);
        expect(first.value.asks).toHaveLength(1);
    });

    it('should handle WebSocket errors gracefully', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                orderbook: {
                    yes: [[52, 100]],
                    no: [[48, 150]]
                }
            }
        });

        mockWsManager.watchOrderBook.mockImplementation(async function* () {
            throw new Error('WebSocket error');
        });

        const generator = exchange.watchOrderBook('FED-25JAN');
        
        const first = await generator.next();
        expect(first.value).toBeDefined();

        await expect(generator.next()).rejects.toThrow('WebSocket error');
    });

    it('should require credentials for WebSocket', async () => {
        const exchangeWithoutCreds = new KalshiExchange();
        
        mockedAxios.get.mockResolvedValue({
            data: { orderbook: { yes: [], no: [] } }
        });

        mockWsManager.watchOrderBook.mockImplementation(async function* () {
        });

        await expect(exchangeWithoutCreds.watchOrderBook('FED-25JAN').next())
            .rejects.toThrow('Kalshi WebSocket requires API credentials');
    });

    it('should reuse WebSocket manager instance', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { orderbook: { yes: [], no: [] } }
        });

        mockWsManager.watchOrderBook.mockImplementation(async function* () {
        });

        const gen1 = exchange.watchOrderBook('FED-25JAN');
        await gen1.next();

        const gen2 = exchange.watchOrderBook('FED-26JAN');
        await gen2.next();

        expect(MockedWebSocketManager).toHaveBeenCalledTimes(1);
    });

    it('should handle empty initial orderbook', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { orderbook: { yes: [], no: [] } }
        });

        mockWsManager.watchOrderBook.mockImplementation(async function* () {
        });

        const generator = exchange.watchOrderBook('FED-25JAN');
        const first = await generator.next();

        expect(first.value.bids).toEqual([]);
        expect(first.value.asks).toEqual([]);
    });

    it('should connect if WebSocket is not connected', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { orderbook: { yes: [], no: [] } }
        });

        mockWsManager.isConnected.mockReturnValue(false);
        mockWsManager.watchOrderBook.mockImplementation(async function* () {
        });

        const generator = exchange.watchOrderBook('FED-25JAN');
        await generator.next();

        expect(mockWsManager.connect).toHaveBeenCalled();
    });

    it('should not connect if WebSocket is already connected', async () => {
        mockedAxios.get.mockResolvedValue({
            data: { orderbook: { yes: [], no: [] } }
        });

        mockWsManager.isConnected.mockReturnValue(true);
        mockWsManager.watchOrderBook.mockImplementation(async function* () {
        });

        const generator = exchange.watchOrderBook('FED-25JAN');
        await generator.next();

        expect(mockWsManager.connect).not.toHaveBeenCalled();
    });

    it('should convert Kalshi orderbook format correctly', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                orderbook: {
                    yes: [[55, 100], [54, 200]],  // bids: 0.55, 0.54
                    no: [[45, 150], [46, 250]]    // asks: 0.55 (100-45), 0.54 (100-46)
                }
            }
        });

        mockWsManager.watchOrderBook.mockImplementation(async function* () {
        });

        const generator = exchange.watchOrderBook('FED-25JAN');
        const first = await generator.next();

        expect(first.value.bids).toHaveLength(2);
        expect(first.value.bids[0].price).toBe(0.55);
        expect(first.value.bids[0].size).toBe(100);
        expect(first.value.bids[1].price).toBe(0.54);
        expect(first.value.bids[1].size).toBe(200);

        expect(first.value.asks).toHaveLength(2);
        // Asks are sorted ascending (lowest price first)
        expect(first.value.asks[0].price).toBe(0.54);  // (100 - 46) / 100 - lower price first
        expect(first.value.asks[0].size).toBe(250);
        expect(first.value.asks[1].price).toBe(0.55);  // (100 - 45) / 100 - higher price second
        expect(first.value.asks[1].size).toBe(150);

        expect(first.value.timestamp).toBeDefined();
    });

    it('should support multiple watchers for the same ticker', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                orderbook: {
                    yes: [[52, 100]],
                    no: [[48, 150]]
                }
            }
        });

        const updates: OrderBook[] = [
            { bids: [{ price: 0.52, size: 110 }], asks: [{ price: 0.48, size: 150 }], timestamp: 2000 },
            { bids: [{ price: 0.52, size: 120 }], asks: [{ price: 0.48, size: 150 }], timestamp: 3000 }
        ];

        mockWsManager.watchOrderBook.mockImplementation(async function* () {
            for (const update of updates) {
                yield update;
            }
        });

        const ticker = 'FED-25JAN';
        const watcher1 = exchange.watchOrderBook(ticker);
        const watcher2 = exchange.watchOrderBook(ticker);

        const first1 = await watcher1.next();
        const first2 = await watcher2.next();

        expect(first1.value).toBeDefined();
        expect(first2.value).toBeDefined();
        expect(first1.value).toEqual(first2.value);

        const second1 = await watcher1.next();
        const second2 = await watcher2.next();

        expect(second1.value).toEqual(updates[0]);
        expect(second2.value).toEqual(updates[0]);
        expect(second1.value).toEqual(second2.value);
    });

    it('should continue serving one watcher when another stops', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                orderbook: {
                    yes: [[52, 100]],
                    no: [[48, 150]]
                }
            }
        });

        const updates: OrderBook[] = [
            { bids: [{ price: 0.52, size: 110 }], asks: [{ price: 0.48, size: 150 }], timestamp: 2000 },
            { bids: [{ price: 0.52, size: 120 }], asks: [{ price: 0.48, size: 150 }], timestamp: 3000 },
            { bids: [{ price: 0.52, size: 130 }], asks: [{ price: 0.48, size: 150 }], timestamp: 4000 }
        ];

        mockWsManager.watchOrderBook.mockImplementation(async function* () {
            for (const update of updates) {
                yield update;
            }
        });

        const ticker = 'FED-25JAN';
        const watcher1 = exchange.watchOrderBook(ticker);
        const watcher2 = exchange.watchOrderBook(ticker);

        await watcher1.next();
        await watcher2.next();

        const second1 = await watcher1.next();
        const second2 = await watcher2.next();

        expect(second1.value).toEqual(updates[0]);
        expect(second2.value).toEqual(updates[0]);

        watcher1.return(undefined);

        const third2 = await watcher2.next();
        expect(third2.value).toEqual(updates[1]);
    });
});
