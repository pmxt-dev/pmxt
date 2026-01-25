#!/usr/bin/env node
import 'dotenv/config';
import { startServer } from './app';
import { PortManager } from './utils/port-manager';
import { LockFile } from './utils/lock-file';

import { randomUUID } from 'crypto';

import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';

function getServerVersion(): string {
    let baseVersion = '1.0.0-b4'; // Hardcoded fallback matching package.json
    let packageJson;

    try {
        // Try multiple possible locations for package.json
        const possiblePaths = [
            join(__dirname, '../../package.json'),      // From dist/server/
            join(__dirname, '../../../package.json'),   // From dist/server/bundled
            join(__dirname, 'package.json'),            // Same directory (unlikely)
        ];

        for (const pkgPath of possiblePaths) {
            try {
                const packageCtx = readFileSync(pkgPath, 'utf-8');
                packageJson = JSON.parse(packageCtx);
                baseVersion = packageJson.version;
                break; // Found it, stop searching
            } catch {
                // Try next path
                continue;
            }
        }
    } catch (e) {
        // Use hardcoded fallback
    }

    // Check if we're in development mode or if generic forced restart is requested
    const isDev = process.env.NODE_ENV === 'development' ||
        process.env.PMXT_ALWAYS_RESTART === '1' ||
        (__dirname.includes('/core/src/') && !!packageJson) ||
        (__dirname.includes('/core/dist/') && !!packageJson);

    if (!isDev) {
        return baseVersion;
    }

    // Development: append code hash based on this file's stats
    try {
        const serverFile = __filename;
        const stats = statSync(serverFile);
        const hash = createHash('md5')
            .update(stats.mtime.toISOString())
            .digest('hex')
            .substring(0, 8);

        return `${baseVersion}-dev.${hash}`;
    } catch {
        return `${baseVersion}-dev.${Date.now()}`;
    }
}

async function main() {
    const portManager = new PortManager();
    const port = await portManager.findAvailablePort(3847); // Default port
    const accessToken = process.env.PMXT_ACCESS_TOKEN || randomUUID();
    const version = getServerVersion();

    const lockFile = new LockFile();
    await lockFile.create(port, process.pid, accessToken, version);

    const server = await startServer(port, accessToken);

    console.log(`PMXT Sidecar Server v${version} running on http://localhost:${port}`);
    if (version.includes('-dev.')) {
        console.log('Running in Development Mode (auto-restart enabled)');
    }
    console.log(`Lock file created at ${lockFile.lockPath}`);

    // Graceful shutdown
    const shutdown = async () => {
        console.log('\nShutting down gracefully...');
        server.close();
        await lockFile.remove();
        process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
