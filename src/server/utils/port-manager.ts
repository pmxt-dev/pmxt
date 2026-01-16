import * as net from 'net';

export class PortManager {
    async findAvailablePort(startPort: number = 3847): Promise<number> {
        let port = startPort;

        while (port < startPort + 100) {
            if (await this.isPortAvailable(port)) {
                return port;
            }
            port++;
        }

        throw new Error(`No available ports found in range ${startPort}-${startPort + 100}`);
    }

    private isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();

            server.once('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(false);
                } else {
                    resolve(false);
                }
            });

            server.once('listening', () => {
                server.close();
                resolve(true);
            });

            server.listen(port);
        });
    }
}
