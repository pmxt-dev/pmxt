import { FeedClient } from '../pmxt/feed-client';

describe('FeedClient.listFeeds', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('requests the feeds index and returns the available feed names', async () => {
        const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
                success: true,
                data: ['binance', 'chainlink'],
            }),
        } as any);

        const client = new FeedClient('binance', { baseUrl: 'http://localhost:3847' });
        await expect(client.listFeeds()).resolves.toEqual(['binance', 'chainlink']);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:3847/api/feeds/',
            expect.objectContaining({
                headers: {},
            }),
        );
        fetchMock.mockRestore();
    });
});
