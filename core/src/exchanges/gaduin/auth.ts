import { AxiosInstance } from 'axios';

/**
 * Exchanges a read-only GADUIN API key (`pk_live_...`) for a short-lived JWT
 * at POST /auth/token and caches it until shortly before it expires.
 */
export class GaduinAuth {
    private token?: string;
    private expiresAt = 0;

    constructor(
        private readonly apiKey: string,
        private readonly http: AxiosInstance,
        private readonly baseUrl: string,
    ) {}

    async refresh(): Promise<void> {
        if (this.token && Date.now() < this.expiresAt) return;
        // An empty JSON body: axios would otherwise label the request as a form, which the endpoint reads as an OAuth grant.
        const { data } = await this.http.post(`${this.baseUrl}/auth/token`, {}, {
            headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        this.token = data.access_token;
        // Renew a minute early so a token never expires between refresh and use.
        this.expiresAt = Date.now() + (Number(data.expires_in) - 60) * 1000;
    }

    getHeaders(): Record<string, string> {
        return { Authorization: `Bearer ${this.token}` };
    }
}
