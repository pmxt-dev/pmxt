const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const coreRoot = path.resolve(__dirname, '../..');
const compliancePath = path.join(coreRoot, 'COMPLIANCE.md');

describe('generate-compliance', () => {
  const regenerateCompliance = () => {
    execFileSync(process.execPath, ['scripts/generate-compliance.js'], {
      cwd: coreRoot,
      stdio: 'pipe',
    });

    return fs.readFileSync(compliancePath, 'utf8');
  };

  test('includes every production exchange in the generated matrix', () => {
    const markdown = regenerateCompliance();
    const expectedExchangeHeaders = [
      'Polymarket',
      'PolymarketUS',
      'Kalshi',
      'Limitless',
      'Probable',
      'Baozi',
      'Myriad',
      'Opinion',
      'Metaculus',
      'Smarkets',
      'Hyperliquid',
      'GeminiTitan',
      'SuiBets',
      'Rain',
      'Hunch',
    ];

    for (const exchange of expectedExchangeHeaders) {
      expect(markdown).toContain(`| ${exchange} `);
    }
  });

  test('documents credential variables for authenticated venue tests', () => {
    const markdown = regenerateCompliance();
    const expectedCredentialVariables = [
      'POLYMARKET_US_KEY_ID',
      'POLYMARKET_US_SECRET_KEY',
      'PROBABLE_API_KEY',
      'BAOZI_PRIVATE_KEY',
      'OPINION_API_KEY',
      'SMARKETS_EMAIL',
      'HYPERLIQUID_WALLET_ADDRESS',
      'GEMINI_API_SECRET',
      'SUIBETS_WALLET_ADDRESS',
      'RAIN_WALLET_ADDRESS',
      'HUNCH_WALLET_ADDRESS',
    ];

    for (const variableName of expectedCredentialVariables) {
      expect(markdown).toContain(variableName);
    }
  });
});
