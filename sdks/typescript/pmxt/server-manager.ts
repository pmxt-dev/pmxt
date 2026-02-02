/**
 * Server manager for PMXT TypeScript SDK.
 * 
 * Handles automatic server startup and health checks.
 */

import { DefaultApi, Configuration } from "../generated/src/index.js";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

export interface ServerManagerOptions {
    baseUrl?: string;
    maxRetries?: number;
    retryDelayMs?: number;
}

interface ServerLockInfo {
    port: number;
    pid: number;
    accessToken?: string;
    version?: string;
    timestamp: number;
}

export class ServerManager {
    private baseUrl: string;
    private maxRetries: number;
    private retryDelayMs: number;
    private api: DefaultApi;
    private lockPath: string;
    private static readonly DEFAULT_PORT = 3847;

    constructor(options: ServerManagerOptions = {}) {
        this.baseUrl = options.baseUrl || `http://localhost:${ServerManager.DEFAULT_PORT}`;
        this.maxRetries = options.maxRetries || 30;
        this.retryDelayMs = options.retryDelayMs || 1000;
        this.lockPath = join(homedir(), '.pmxt', 'server.lock');

        const config = new Configuration({ basePath: this.baseUrl });
        this.api = new DefaultApi(config);
    }

    /**
     * Read server information from lock file.
     */
    private getServerInfo(): ServerLockInfo | null {
        try {
            if (!existsSync(this.lockPath)) {
                return null;
            }
            const content = readFileSync(this.lockPath, 'utf-8');
            return JSON.parse(content) as ServerLockInfo;
        } catch {
            return null;
        }
    }

    /**
     * Get the actual port the server is running on.
     * 
     * This reads the lock file to determine the actual port,
     * which may differ from the default if the default port was busy.
     */
    getRunningPort(): number {
        const info = this.getServerInfo();
        return info?.port || ServerManager.DEFAULT_PORT;
    }

    /**
     * Get the access token from the lock file.
     */
    getAccessToken(): string | undefined {
        const info = this.getServerInfo();
        return info?.accessToken;
    }

    /**
     * Check if the server is running.
     */
    async isServerRunning(): Promise<boolean> {
        // Read lock file to get current port
        const port = this.getRunningPort();

        try {
            // Use native fetch to check health on the actual running port
            // This avoids issues where this.api is configured with the wrong port
            const response = await fetch(`http://localhost:${port}/health`);
            if (response.ok) {
                const data = await response.json();
                return (data as any).status === "ok";
            }
            return false;
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
        // Check for force restart
        if (process.env.PMXT_ALWAYS_RESTART === '1') {
            await this.killOldServer();
        }

        // Check if already running and version matches
        if (await this.isServerRunning()) {
            if (await this.isVersionMismatch()) {
                await this.killOldServer();
            } else {
                return;
            }
        }

        // Locate pmxt-ensure-server
        let launcherPath = 'pmxt-ensure-server'; // Default to PATH

        try {
            // Try to resolve from pmxt-core dependency
            // For CommonJS build (which is primary), we can use require directly
            // For ESM build, this will be transpiled appropriately
            const corePackageJson = require.resolve('pmxt-core/package.json');
            const coreDir = dirname(corePackageJson);
            const binPath = join(coreDir, 'bin', 'pmxt-ensure-server');

            if (existsSync(binPath)) {
                launcherPath = binPath;
            }
        } catch (error) {
            // If resolution fails, fall back to PATH
            // This could happen in dev environments where pmxt-core is globally installed
        }

        // Try to start the server using pmxt-ensure-server
        const { spawn } = await import("child_process");

        try {
            const proc = spawn(launcherPath, [], {
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

    private async isVersionMismatch(): Promise<boolean> {
        const info = this.getServerInfo();
        if (!info || !info.version) {
            return true; // Old server without version
        }

        try {
            // 1. Try to find package.json relative to the installed location (Production)
            let corePackageJsonPath: string | undefined;
            try {
                corePackageJsonPath = require.resolve('pmxt-core/package.json');
            } catch {
                // 2. Try dev path (Monorepo)
                const devPath = join(dirname(__dirname), '../../core/package.json');
                if (existsSync(devPath)) {
                    corePackageJsonPath = devPath;
                }
            }

            if (corePackageJsonPath && existsSync(corePackageJsonPath)) {
                const content = readFileSync(corePackageJsonPath, 'utf-8');
                const pkg = JSON.parse(content);
                // Check if running version starts with package version
                // (Server version might have extra hash in dev mode)
                if (pkg.version && !info.version.startsWith(pkg.version)) {
                    return true;
                }
            }
        } catch {
            // Ignore errors
        }
        return false;
    }

    /**
     * Stop the currently running server.
     */
    async stop(): Promise<void> {
        await this.killOldServer();
    }

    /**
     * Restart the server.
     */
    async restart(): Promise<void> {
        await this.stop();
        await this.ensureServerRunning();
    }

    private async killOldServer(): Promise<void> {
        const info = this.getServerInfo();
        if (info && info.pid) {
            try {
                process.kill(info.pid, 'SIGTERM');
                // Brief wait
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch {
                // Ignore
            }
        }
        // Remove lock file (best effort)
        try {
            const { unlinkSync } = await import('fs');
            unlinkSync(this.lockPath);
        } catch { }
    }
}
