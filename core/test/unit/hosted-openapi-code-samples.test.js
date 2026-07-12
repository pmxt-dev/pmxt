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

function collectStrings(value) {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

function collectHostedVenueEnums(value) {
  if (Array.isArray(value)) {
    return value.flatMap(collectHostedVenueEnums);
  }
  if (value && typeof value === 'object') {
    const current = Array.isArray(value.enum)
      && value.enum.includes('polymarket')
      && value.enum.includes('opinion')
      ? [value.enum]
      : [];
    return [
      ...current,
      ...Object.values(value).flatMap(collectHostedVenueEnums),
    ];
  }
  return [];
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

  test('show build-submit samples with concrete outcome objects', () => {
    const spec = JSON.parse(fs.readFileSync(hostedTradingSpecPath, 'utf8'));
    const operation = getOperation(spec, 'submitOrderHosted');
    const pythonSamples = getSamples(operation, 'python');
    const typescriptSamples = getSamples(operation, 'javascript');

    expect(pythonSamples.length).toBeGreaterThan(0);
    expect(typescriptSamples.length).toBeGreaterThan(0);

    for (const sample of pythonSamples) {
      expect(sample).toContain('yes = next(o for o in market.outcomes');
      expect(sample).toContain('outcome=yes');
      expect(sample).not.toContain('outcome=market.yes');
    }

    for (const sample of typescriptSamples) {
      expect(sample).toContain('const yes = market.outcomes.find(');
      expect(sample).toContain('outcome: yes');
      expect(sample).not.toContain('outcome: market.yes');
    }
  });

  test('scope hosted funding copy to current hosted venues', () => {
    const spec = JSON.parse(fs.readFileSync(hostedTradingSpecPath, 'utf8'));
    const text = collectStrings(spec).join('\n');

    expect(text).toContain('Current hosted venues are funded once on Polygon');
    expect(text).toContain(
      'for Polymarket, Opinion, and Limitless. PMXT cannot move funds without your EIP-712 signature.',
    );
    expect(text).toContain(
      'Backs trading on Polymarket, Opinion, and Limitless.',
    );

    expect(text).not.toContain('All hosted venues are funded once on Polygon');
    expect(text).not.toContain('single funding location for every hosted venue');
    expect(text).not.toContain('Backs trading across every hosted venue');
  });

  test('list Limitless in hosted venue enums', () => {
    const spec = JSON.parse(fs.readFileSync(hostedTradingSpecPath, 'utf8'));
    const venueEnums = collectHostedVenueEnums(spec);

    expect(venueEnums.length).toBeGreaterThanOrEqual(6);
    for (const venueEnum of venueEnums) {
      expect(venueEnum).toEqual(
        expect.arrayContaining(['polymarket', 'opinion', 'limitless']),
      );
    }
  });

  test('scope hosted account descriptions to current hosted venues', () => {
    const spec = JSON.parse(fs.readFileSync(hostedTradingSpecPath, 'utf8'));
    const text = collectStrings(spec).join('\n');

    expect(text).toContain('across Polymarket, Opinion, and Limitless');
    expect(text).toContain('Place a buy or sell order on Polymarket, Opinion, or Limitless.');
    expect(text).toContain('Filter by `venue` to scope to Polymarket, Opinion, or Limitless.');
    expect(text).toContain('e.g. `polymarket`, `opinion`, `limitless`');

    expect(text).not.toContain('across Polymarket and Opinion');
    expect(text).not.toContain('on Polymarket and Opinion');
    expect(text).not.toContain('Polymarket or Opinion');
    expect(text).not.toContain('scope to Polymarket or Opinion only');
    expect(text).not.toContain('e.g. `polymarket`, `opinion`),');
  });
});
