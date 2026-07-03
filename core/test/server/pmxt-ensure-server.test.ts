import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

type ServerLock = {
    readonly pid?: number;
    readonly port?: number;
};

const SHORT_HEALTH_CHECK_TIMEOUT_MS = 2500;
const SHORT_HEALTH_CHECK_INTERVAL_MS = 25;
const STALE_LOCK_HEALTH_TIMEOUT_MS = 100;
const FAKE_SERVER_LOCK_DELAY_MS = 250;
const LAUNCHER_PROCESS_TIMEOUT_MS = 8000;

function writeExecutable(filePath: string, content: string): void {
    writeFileSync(filePath, content, { mode: 0o755 });
    chmodSync(filePath, 0o755);
}

function readLock(lockPath: string): ServerLock {
    return JSON.parse(readFileSync(lockPath, 'utf8')) as ServerLock;
}

function launcherSourceWithShortTimeouts(): string {
    const source = readFileSync(join(__dirname, '../../bin/pmxt-ensure-server'), 'utf8');
    return source
        .replace(
            'const HEALTH_CHECK_TIMEOUT = 10000;',
            `const HEALTH_CHECK_TIMEOUT = ${SHORT_HEALTH_CHECK_TIMEOUT_MS};`,
        )
        .replace(
            'const HEALTH_CHECK_INTERVAL = 100;',
            `const HEALTH_CHECK_INTERVAL = ${SHORT_HEALTH_CHECK_INTERVAL_MS};`,
        )
        .replace(
            'await waitForHealth(serverStatus.port, 2000);',
            `await waitForHealth(serverStatus.port, ${STALE_LOCK_HEALTH_TIMEOUT_MS});`,
        );
}

function fakeServerSource(): string {
    return `#!/usr/bin/env node
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const pmxtDir = path.join(os.homedir(), '.pmxt');
const lockPath = path.join(pmxtDir, 'server.lock');
fs.mkdirSync(pmxtDir, { recursive: true });

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  setTimeout(() => {
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, port, version: 'fake' }));
  }, ${FAKE_SERVER_LOCK_DELAY_MS});
});
`;
}

describe('pmxt-ensure-server launcher', () => {
    it('ignores a stale unhealthy lock before waiting for the replacement sidecar lock', () => {
        const workspace = mkdtempSync(join(tmpdir(), 'pmxt-ensure-server-'));
        const home = join(workspace, 'home');
        const bin = join(workspace, 'bin');
        const pmxtHome = join(home, '.pmxt');
        const lockPath = join(pmxtHome, 'server.lock');
        const launcherPath = join(workspace, 'pmxt-ensure-server.js');
        const fakeServerPath = join(bin, 'pmxt-server');

        mkdirSync(pmxtHome, { recursive: true });
        mkdirSync(bin, { recursive: true });
        writeFileSync(lockPath, JSON.stringify({ pid: process.pid, port: 65534, version: 'stale' }));
        writeExecutable(launcherPath, launcherSourceWithShortTimeouts());
        writeExecutable(fakeServerPath, fakeServerSource());

        try {
            const result = spawnSync(process.execPath, [launcherPath], {
                cwd: workspace,
                env: {
                    ...process.env,
                    HOME: home,
                    PATH: `${bin}:${process.env.PATH ?? ''}`,
                },
                encoding: 'utf8',
                timeout: LAUNCHER_PROCESS_TIMEOUT_MS,
            });
            const finalLock = existsSync(lockPath) ? readLock(lockPath) : {};

            expect(result.status).toBe(0);
            expect(finalLock.pid).toEqual(expect.any(Number));
            expect(finalLock.pid).not.toBe(process.pid);
            expect(finalLock.port).toEqual(expect.any(Number));

            if (finalLock.pid && finalLock.pid !== process.pid) {
                process.kill(finalLock.pid, 'SIGTERM');
            }
        } finally {
            if (existsSync(lockPath)) {
                const finalLock = readLock(lockPath);
                if (finalLock.pid && finalLock.pid !== process.pid) {
                    try {
                        process.kill(finalLock.pid, 'SIGTERM');
                    } catch {
                        // Process already exited.
                    }
                }
            }
            rmSync(workspace, { recursive: true, force: true });
        }
    });
});
