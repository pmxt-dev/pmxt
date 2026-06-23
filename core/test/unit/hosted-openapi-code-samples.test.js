const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const hostedTradingSpecPath = path.join(
  repoRoot,
  'docs/api-reference/openapi-hosted-trading.json',
);

function getOperation(spec, operationId) {
  for (const pathItem of Object.values(spec.paths || {})) {
    for (const operation of Object.values(pathItem || {})) {
      if (operation && operation.operationId === operationId) {
        return operation;
      }
    }
  }
  throw new Error(`Operation not found: ${operationId}`);
}

function getSamples(operation, language) {
  return (operation['x-codeSamples'] || [])
    .filter((sample) => sample.lang === language)
    .map((sample) => sample.source);
}

describe('Hosted OpenAPI SDK code samples', () => {
  test('show fetchBalance as a list in TypeScript and Python SDKs', () => {
    const spec = JSON.parse(fs.readFileSync(hostedTradingSpecPath, 'utf8'));
    const operation = getOperation(spec, 'fetchBalanceHosted');
    const pythonSamples = getSamples(operation, 'python');
    const typescriptSamples = getSamples(operation, 'javascript');

    expect(pythonSamples.length).toBeGreaterThan(0);
    expect(typescriptSamples.length).toBeGreaterThan(0);

    for (const sample of pythonSamples) {
      expect(sample).toContain('balances = client.fetch_balance()');
      expect(sample).toContain('balance = balances[0]');
      expect(sample).toContain('balance.available');
      expect(sample).not.toContain('balance = client.fetch_balance()');
      expect(sample).not.toContain('balance.amount');
    }

    for (const sample of typescriptSamples) {
      expect(sample).toContain('const balances = await client.fetchBalance();');
      expect(sample).toContain('balances[0].available');
      expect(sample).not.toContain('const balance = await client.fetchBalance();');
      expect(sample).not.toContain('balance.amount');
    }
  });
});
