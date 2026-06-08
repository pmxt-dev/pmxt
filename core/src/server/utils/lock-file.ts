import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { logger } from '../../utils/logger';

export class LockFile {
    public lockPath: string;

    constructor() {
        this.lockPath = path.join(os.homedir(), '.pmxt', 'server.lock');
    }

    async create(port: number, pid: number, accessToken: string, version: string): Promise<void> {
        await fs.mkdir(path.dirname(this.lockPath), { recursive: true });
        await fs.writeFile(
            this.lockPath,
            JSON.stringify({ port, pid, accessToken, version, timestamp: Date.now() }, null, 2)
        );
    }

    async read(): Promise<{ port: number; pid: number; accessToken?: string; version?: string; timestamp: number } | null> {
        try {
            const data = await fs.readFile(this.lockPath, 'utf-8');
            return JSON.parse(data);
        } catch (err: any) {
            if (err?.code === 'ENOENT') return null;
            throw err;
        }
    }

    async remove(): Promise<void> {
        try {
            await fs.unlink(this.lockPath);
        } catch (err: any) {
            if (err?.code !== 'ENOENT') {
                logger.warn('LockFile: failed to remove lock', { path: this.lockPath, error: String(err) });
            }
        }
    }

    private isProcessRunning(pid: number): boolean {
        if (process.platform === 'win32') {
            // process.kill(pid, 0) is unreliable on Windows
            try {
                const output = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
                    encoding: 'utf-8',
                    timeout: 5000,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
                return output.includes(String(pid));
            } catch {
                return false;
            }
        }
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    async isServerRunning(): Promise<boolean> {
        const lock = await this.read();
        if (!lock) return false;

        if (this.isProcessRunning(lock.pid)) {
            return true;
        }

        // Process doesn't exist, remove stale lock file
        await this.remove();
        return false;
    }
}
