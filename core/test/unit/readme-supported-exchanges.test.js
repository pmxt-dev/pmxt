const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const readmePath = path.join(repoRoot, 'readme.md');

describe('README supported exchanges', () => {
  test('lists every production exchange in the supported exchange strip', () => {
    const readme = fs.readFileSync(readmePath, 'utf8');
    const expectedAltTexts = [
      'Polymarket',
      'Polymarket US',
      'Kalshi',
      'Limitless',
      'Probable',
      'Baozi',
      'Myriad',
      'Opinion',
      'Metaculus',
      'Smarkets',
      'Hyperliquid',
      'Gemini Titan',
      'SuiBets',
      'Rain',
      'Hunch',
    ];

    for (const altText of expectedAltTexts) {
      expect(readme).toContain(`alt="${altText}"`);
    }
  });
});
