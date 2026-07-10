/**
 * Server manager for PMXT TypeScript SDK.
 * 
 * Handles automatic server startup and health checks.
 */

import { DefaultApi, Configuration } from "../generated/src/index.js";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { logger } from "./logger.js";

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

    // Process-wide coalescing of concurrent ensureServerRunning() calls.
    //
    // Each `Exchange` instance constructs its own ServerManager and each one
    // kicks off ensureServerRunning() from its constructor. Without
    // coalescing, N Exchange instances created in parallel all see "no
    // server running", all spawn their own sidecar via pmxt-ensure-server,
    // and the lock file ends up pointing at whichever spawn wrote last. Each
    // Exchange instance has already captured its own basePath at
    // construction time, so most of them end up talking to a sidecar whose
    // access token does NOT match the token they later read from the lock
    // file — every request returns 401 Unauthorized.
    //
    // The fix is process-wide: when a ensureServerRunning call is in
    // flight, all subsequent callers await the same promise. After the
    // in-flight call settles (success OR failure) the cache is cleared so
    // later callers can re-check the sidecar state (e.g. if it was killed
    // by the user between ticks).
    //
    // This is static on purpose — all ServerManager instances in the
    // process share the same sidecar and the same lock file, so they must
    // share the same in-flight promise.
    private static ensurePromise: Promise<void> | null = null;

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
        const info = this.getServerInfo();
        if (!info?.port) {
            return false;
        }

        try {
            // Use native fetch to check health on the actual running port
            // This avoids issues where this.api is configured with the wrong port
            const response = await fetch(`http://localhost:${info.port}/health`, {
                signal: AbortSignal.timeout(5_000),
            });
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
     * Backwards-compatible alias for `isServerRunning()`.
     */
    async isServerAlive(): Promise<boolean> {
        return this.isServerRunning();
    }

    /**
     * Wait for the server to be ready.
     * Requires a lock file to be present to avoid falsely matching an unrelated
     * server that may already be running on the default port.
     */
    private async waitForServer(): Promise<void> {
        for (let i = 0; i < this.maxRetries; i++) {
            const info = this.getServerInfo();
            if (info) {
                try {
                    const response = await fetch(`http://localhost:${info.port}/health`, {
                        signal: AbortSignal.timeout(5_000),
                    });
                    if (response.ok) {
                        const data = await response.json() as any;
                        if (data.status === "ok") return;
                    }
                } catch (err) {
                    logger.debug('server-manager: health poll error', { error: String(err) });
                }
            }
            await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
        }
        throw new Error(
            `Server did not start within ${(this.maxRetries * this.retryDelayMs) / 1000}s`
        );
    }

    /**
     * Ensure the server is running, starting it if necessary.
     *
     * Concurrent calls across all ServerManager instances in the process
     * are coalesced onto a single in-flight promise. See the comment on
     * `ServerManager.ensurePromise` for why this matters.
     */
    async ensureServerRunning(): Promise<void> {
        if (ServerManager.ensurePromise) {
            return ServerManager.ensurePromise;
        }
        ServerManager.ensurePromise = this.doEnsureServerRunning().finally(() => {
            ServerManager.ensurePromise = null;
        });
        return ServerManager.ensurePromise;
    }

    private async doEnsureServerRunning(): Promise<void> {
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
        const isWindows = process.platform === 'win32';
        const launcherName = isWindows ? 'pmxt-ensure-server.js' : 'pmxt-ensure-server';
        let launcherPath = launcherName; // Default to PATH

        try {
            // Try to resolve from pmxt-core dependency
            // For CommonJS build (which is primary), we can use require directly
            // For ESM build, this will be transpiled appropriately
            const corePackageJson = require.resolve('pmxt-core/package.json');
            const coreDir = dirname(corePackageJson);
            const binPath = join(coreDir, 'bin', launcherName);

            if (existsSync(binPath)) {
                launcherPath = binPath;
            }
        } catch (error: unknown) {
            if (process.env.PMXT_LOG_LEVEL === 'debug') {
                const msg = error instanceof Error ? error.message : String(error);
                process.stderr.write(`[pmxt] Binary path resolution failed, falling back to PATH: ${msg}\n`);
            }
        }

        // Try to start the server using pmxt-ensure-server
        const { spawn } = await import("child_process");

        // On Windows, .js scripts must be run via node explicitly
        const spawnCmd = launcherPath.endsWith('.js') ? 'node' : launcherPath;
        const spawnArgs = launcherPath.endsWith('.js') ? [launcherPath] : [];

        try {
            const proc = spawn(spawnCmd, spawnArgs, {
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
        } catch (err) {
            logger.warn('server-manager: version check failed', { error: String(err) });
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

    /**
     * Start the server if it is not already running.
     *
     * Idempotent: if the server is already running and healthy this returns
     * immediately without restarting.
     */
    async start(): Promise<void> {
        await this.ensureServerRunning();
    }

    /**
     * Get a structured snapshot of the sidecar server state.
     *
     * Returns a fresh object on every call (no shared mutable state).
     */
    async status(): Promise<{
        running: boolean;
        pid: number | null;
        port: number | null;
        version: string | null;
        uptimeSeconds: number | null;
        lockFile: string;
    }> {
        const info = this.getServerInfo();
        const running = await this.isServerRunning();

        let uptimeSeconds: number | null = null;
        if (info && typeof info.timestamp === "number") {
            const nowSeconds = Date.now() / 1000;
            const tsSeconds = info.timestamp > 1e12 ? info.timestamp / 1000 : info.timestamp;
            const delta = nowSeconds - tsSeconds;
            if (delta >= 0) uptimeSeconds = delta;
        }

        return {
            running,
            pid: info?.pid ?? null,
            port: info?.port ?? null,
            version: info?.version ?? null,
            uptimeSeconds,
            lockFile: this.lockPath,
        };
    }

    /**
     * Check whether the server's /health endpoint is currently responsive.
     */
    async health(): Promise<boolean> {
        return this.isServerRunning();
    }

    /**
     * Return the last `n` lines from the sidecar server log file.
     *
     * The launcher writes server stdout/stderr to ~/.pmxt/server.log.
     * Returns an empty array if no log file is present.
     */
    logs(n: number = 50): string[] {
        if (n <= 0) return [];
        const logPath = join(dirname(this.lockPath), "server.log");
        try {
            if (!existsSync(logPath)) return [];
            const content = readFileSync(logPath, "utf-8");
            const lines = content.split(/\r?\n/);
            // split on a trailing newline produces an empty final element; drop it
            if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
            return lines.length > n ? lines.slice(lines.length - n) : lines;
        } catch {
            return [];
        }
    }

    private async killOldServer(): Promise<void> {
        const info = this.getServerInfo();
        if (info && info.pid) {
            try {
                process.kill(info.pid, 'SIGTERM');
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch {
                // Process already dead — fall through to lock cleanup
            }

            // Verify the process is actually dead; escalate to SIGKILL if not
            try {
                process.kill(info.pid, 0); // throws if dead
                // Still alive — force kill
                try {
                    process.kill(info.pid, 'SIGKILL');
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch {
                    // Ignore — SIGKILL may race with natural exit
                }
            } catch {
                // Process is dead — good
            }
        }
        // Remove lock file (best effort)
        try {
            const { unlinkSync } = await import('fs');
            unlinkSync(this.lockPath);
        } catch (err) {
            // Best-effort — expected when file was already removed.
            logger.debug('server-manager: lock file removal failed', { path: this.lockPath, error: String(err) });
        }
    }
}
