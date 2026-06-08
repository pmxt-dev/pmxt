import { Throttler } from '../../src/utils/throttler';

describe('Throttler', () => {
    it('rejects new requests instead of silently resolving the oldest queued waiter', async () => {
        const throttler = new Throttler({
            refillRate: 1,
            capacity: 1,
            delay: 1,
            maxQueueDepth: 1,
        });

        let oldestResolved = false;
        (throttler as any).queue.push({
            resolve: () => {
                oldestResolved = true;
            },
            cost: 1,
        });

        await expect(throttler.throttle(1)).rejects.toThrow(/queue full/i);
        expect(oldestResolved).toBe(false);
        expect((throttler as any).queue).toHaveLength(1);
    });
});
