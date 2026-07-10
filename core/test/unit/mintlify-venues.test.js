const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const venuesPath = path.join(repoRoot, 'docs/concepts/venues.mdx');

describe('Mintlify venues page generation', () => {
  test('writes user-facing venue labels and excludes internal targets', () => {
    execFileSync(process.execPath, ['scripts/generate-mintlify-docs.js'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });

    const venues = fs.readFileSync(venuesPath, 'utf8');
    const expectedRows = [
      '| Polymarket | `polymarket` |',
      '| Polymarket US | `polymarket_us` |',
      '| Kalshi | `kalshi` |',
      '| Kalshi (Demo) | `kalshi-demo` |',
      '| Limitless | `limitless` |',
      '| Probable | `probable` |',
      '| Baozi | `baozi` |',
      '| Myriad | `myriad` |',
      '| Opinion | `opinion` |',
      '| Metaculus | `metaculus` |',
      '| Smarkets | `smarkets` |',
      '| Gemini Titan | `gemini-titan` |',
      '| Hyperliquid | `hyperliquid` |',
      '| SuiBets | `suibets` |',
      '| Rain | `rain` |',
      '| Hunch | `hunch` |',
    ];

    for (const row of expectedRows) {
      expect(venues).toContain(row);
    }

    expect(venues).not.toContain('| mock | `mock` |');
    expect(venues).not.toContain('| Router | `router` |');
  });
});
