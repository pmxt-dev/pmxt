#!/usr/bin/env node
import 'dotenv/config';
import { startServer } from './app';
import { PortManager } from './utils/port-manager';
import { LockFile } from './utils/lock-file';
import { logger } from '../utils/logger';

import { randomUUID } from 'crypto';

import { createHash } from 'crypto';
import { statSync } from 'fs';

declare const __PMXT_VERSION__: string;

function getServerVersion(): string {
    const baseVersion = typeof __PMXT_VERSION__ !== 'undefined'
        ? __PMXT_VERSION__
        : '0.0.0-dev';

    // Check if we're in development mode or if generic forced restart is requested
    const isDev = process.env.NODE_ENV === 'development' ||
        process.env.PMXT_ALWAYS_RESTART === '1' ||
        __dirname.includes('/core/src/') ||
        __dirname.includes('/core/dist/');

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

    logger.info(`PMXT Sidecar Server v${version} running on http://localhost:${port}`);
    if (version.includes('-dev.')) {
        logger.info('Running in Development Mode (auto-restart enabled)');
    }
    logger.info(`Lock file created at ${lockFile.lockPath}`);

    // Graceful shutdown
    let shuttingDown = false;
    const shutdown = () => {
        if (shuttingDown) return;
        shuttingDown = true;

        logger.info('Shutting down gracefully...');
        server.close();
        void lockFile.remove()
            .catch((error) => {
                logger.warn('Failed to remove lock file during shutdown:', error);
            })
            .finally(() => {
                process.exit(0);
            });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

main().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
});
