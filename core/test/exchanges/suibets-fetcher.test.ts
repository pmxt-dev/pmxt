import { SuibetsFetcher } from '../../src/exchanges/suibets/fetcher';

describe('SuibetsFetcher', () => {
    it('groups offers by renamed eventId when matchId is absent', async () => {
        const http = {
            get: jest.fn().mockResolvedValue({
                data: {
                    offers: [
                        {
                            id: 'offer-1',
                            eventId: 'event-1',
                            eventName: 'Mets vs Yankees',
                            sportName: 'Baseball',
                            homeTeam: 'Mets',
                            awayTeam: 'Yankees',
                            creatorWallet: '0xabc',
                            creatorTeam: 'Mets',
                            creatorOdds: 2,
                            creatorStake: 1_000_000_000,
                            takerStake: 1_000_000_000,
                            matchDate: '2026-07-01T18:00:00Z',
                            expiresAt: '2026-07-01T17:00:00Z',
                            status: 'OPEN',
                        },
                    ],
                },
            }),
        };
        const fetcher = new SuibetsFetcher({ http } as any, 'https://api.example.test');

        const events = await fetcher.fetchRawEvents({} as any);

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            id: 'event-1',
            name: 'Mets vs Yankees',
            sport: 'Baseball',
        });
        expect(events[0].offers).toHaveLength(1);
    });
});