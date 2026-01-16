import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export class LockFile {
    public lockPath: string;

    constructor() {
        this.lockPath = path.join(os.homedir(), '.pmxt', 'server.lock');
    }

    async create(port: number, pid: number): Promise<void> {
        await fs.mkdir(path.dirname(this.lockPath), { recursive: true });
        await fs.writeFile(
            this.lockPath,
            JSON.stringify({ port, pid, timestamp: Date.now() }, null, 2)
        );
    }

    async read(): Promise<{ port: number; pid: number; timestamp: number } | null> {
        try {
            const data = await fs.readFile(this.lockPath, 'utf-8');
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    async remove(): Promise<void> {
        try {
            await fs.unlink(this.lockPath);
        } catch {
            // Ignore errors if file doesn't exist
        }
    }

    async isServerRunning(): Promise<boolean> {
        const lock = await this.read();
        if (!lock) return false;

        // Check if process is still alive
        try {
            process.kill(lock.pid, 0); // Signal 0 checks existence without killing
            return true;
        } catch {
            // Process doesn't exist, remove stale lock file
            await this.remove();
            return false;
        }
    }
}
