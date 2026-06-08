export class Throttler {
    private tokens: number = 0;
    private queue: { resolve: () => void; cost: number }[] = [];
    private running: boolean = false;
    private lastTimestamp: number = 0;

    private refillRate: number;
    private capacity: number;
    private delay: number;
    private maxQueueDepth: number;

    constructor(config: {
        refillRate: number;   // tokens per ms (1 / rateLimit)
        capacity: number;     // max tokens
        delay: number;        // polling interval in ms
        maxQueueDepth?: number; // max queued requests (default 1000)
    }) {
        this.refillRate = config.refillRate;
        this.capacity = config.capacity;
        this.delay = config.delay;
        this.maxQueueDepth = config.maxQueueDepth ?? 1000;
    }

    async throttle(cost: number = 1): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.queue.length >= this.maxQueueDepth) {
                reject(new Error(`Throttler queue full (max depth ${this.maxQueueDepth})`));
                return;
            }
            this.queue.push({ resolve, cost });
            if (!this.running) {
                this.running = true;
                this.loop();
            }
        });
    }

    private async loop(): Promise<void> {
        while (this.queue.length > 0) {
            const now = Date.now();
            if (this.lastTimestamp > 0) {
                const elapsed = now - this.lastTimestamp;
                this.tokens = Math.min(this.tokens + elapsed * this.refillRate, this.capacity);
            }
            this.lastTimestamp = now;

            const head = this.queue[0];
            if (this.tokens >= 0) {
                this.tokens -= head.cost;
                head.resolve();
                this.queue.shift();
            } else {
                await this.sleep(this.delay);
            }
        }
        this.running = false;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
