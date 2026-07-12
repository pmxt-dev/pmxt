const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const readmePath = path.join(repoRoot, 'sdks/typescript/README.md');

describe('TypeScript SDK README samples', () => {
  test('do not reference an unimported pmxt namespace', () => {
    const readme = fs.readFileSync(readmePath, 'utf8');

    expect(readme).not.toMatch(/\bnew pmxt\./);
  });
});
