/**
 * Server manager for PMXT TypeScript SDK.
 * 
 * Handles automatic server startup and health checks.
 */

import { DefaultApi, Configuration } from "../generated/src/index.js";

export interface ServerManagerOptions {
    baseUrl?: string;
    maxRetries?: number;
    retryDelayMs?: number;
}

export class ServerManager {
    private baseUrl: string;
    private maxRetries: number;
    private retryDelayMs: number;
    private api: DefaultApi;

    constructor(options: ServerManagerOptions = {}) {
        this.baseUrl = options.baseUrl || "http://localhost:3847";
        this.maxRetries = options.maxRetries || 30;
        this.retryDelayMs = options.retryDelayMs || 1000;

        const config = new Configuration({ basePath: this.baseUrl });
        this.api = new DefaultApi(config);
    }

    /**
     * Check if the server is running.
     */
    async isServerRunning(): Promise<boolean> {
        try {
            const response = await this.api.healthCheck();
            return response.status === "ok";
        } catch (error) {
            return false;
        }
    }

    /**
     * Wait for the server to be ready.
     */
    private async waitForServer(): Promise<void> {
        for (let i = 0; i < this.maxRetries; i++) {
            if (await this.isServerRunning()) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
        }
        throw new Error(
            `Server did not start within ${(this.maxRetries * this.retryDelayMs) / 1000}s`
        );
    }

    /**
     * Ensure the server is running, starting it if necessary.
     */
    async ensureServerRunning(): Promise<void> {
        // Check if already running
        if (await this.isServerRunning()) {
            return;
        }

        // Try to start the server using pmxt-ensure-server
        const { spawn } = await import("child_process");

        try {
            const proc = spawn("pmxt-ensure-server", [], {
                detached: true,
                stdio: "ignore",
            });
            proc.unref();

            // Wait for server to be ready
            await this.waitForServer();
        } catch (error) {
            throw new Error(
                `Failed to start PMXT server: ${error}\n\n` +
                `Please ensure 'pmxt-core' is installed: npm install -g pmxt-core\n` +
                `Or start the server manually: pmxt-server`
            );
        }
    }
}
