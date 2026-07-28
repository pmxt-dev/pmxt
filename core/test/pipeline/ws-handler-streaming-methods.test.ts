import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');

function read(relativePath: string): string {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('WebSocket streaming method registry', () => {
    it('accepts every exchange method declared with the ws verb', () => {
        const methodVerbConfig = JSON.parse(read('core/src/server/method-verbs.json')) as Record<string, { verb?: string }>;
        const wsHandler = read('core/src/server/ws-handler.ts');

        const registeredMethodNames = new Set(
            Array.from(wsHandler.matchAll(/(?:["'])(watch[A-Za-z]+|unwatch[A-Za-z]+)(?:["'])|\b(unwatch[A-Za-z]+)\s*:/g))
                .map((match) => match[1] || match[2])
                .filter(Boolean),
        );
        const wsMethods = Object.entries(methodVerbConfig)
            .filter(([, config]) => config.verb === 'ws')
            .map(([method]) => method);

        expect(wsMethods.filter((method) => !registeredMethodNames.has(method))).toEqual([]);
    });
});
