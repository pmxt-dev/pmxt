const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const coreRoot = path.join(repoRoot, 'core');
const openApiPath = path.join(repoRoot, 'docs/api-reference/openapi.json');
const sidecarOpenApiPath = path.join(coreRoot, 'src/server/openapi.yaml');
const methodVerbsPath = path.join(coreRoot, 'src/server/method-verbs.json');
const typescriptIndexPath = path.join(repoRoot, 'sdks/typescript/index.ts');
const pythonInitPath = path.join(repoRoot, 'sdks/python/pmxt/__init__.py');
const generatedPaths = [openApiPath, sidecarOpenApiPath, methodVerbsPath];

function snapshotGeneratedFiles() {
  return new Map(
    generatedPaths.map((filePath) => [filePath, fs.readFileSync(filePath, 'utf8')]),
  );
}

function restoreGeneratedFiles(snapshot) {
  for (const [filePath, contents] of snapshot) {
    fs.writeFileSync(filePath, contents, 'utf8');
  }
}

function collectSampleClassNames(spec, language) {
  return [
    ...new Set(
      Object.values(spec.paths || {})
        .flatMap((pathItem) => Object.values(pathItem))
        .filter((operation) => operation && typeof operation === 'object')
        .flatMap((operation) => operation['x-codeSamples'] || [])
        .filter((sample) => sample.lang === language)
        .filter((sample) => !['Python', 'TypeScript'].includes(sample.label))
        .map((sample) => sample.label),
    ),
  ].sort();
}

function collectTypescriptExports(source) {
  return new Set(
    [...source.matchAll(/^export \{([^}]+)\} from ".+";/gm)]
      .flatMap((match) => match[1].split(','))
      .map((rawName) => rawName.trim().split(/\s+as\s+/).pop())
      .filter(Boolean),
  );
}

function collectPythonAll(source) {
  const allBlock = source.match(/__all__ = \[([\s\S]*?)\]/);
  if (!allBlock) return new Set();
  return new Set([...allBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]));
}

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

function collectOperationSamples(spec, operationId, language) {
  return (getOperation(spec, operationId)['x-codeSamples'] || [])
    .filter((sample) => sample.lang === language)
    .map((sample) => sample.source);
}

function collectOperationSampleLabels(spec, operationId) {
  return (getOperation(spec, operationId)['x-codeSamples'] || [])
    .map((sample) => sample.label);
}

function collectAllCodeSamples(spec) {
  return Object.values(spec.paths || {})
    .flatMap((pathItem) => Object.values(pathItem || {}))
    .filter((operation) => operation && typeof operation === 'object')
    .flatMap((operation) => operation['x-codeSamples'] || []);
}

function withGeneratedSpec(assertion) {
  const snapshot = snapshotGeneratedFiles();
  try {
    execFileSync(process.execPath, ['scripts/generate-openapi.js'], {
      cwd: coreRoot,
      stdio: 'pipe',
    });

    const spec = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
    return assertion(spec);
  } finally {
    restoreGeneratedFiles(snapshot);
  }
}

describe('OpenAPI SDK code samples', () => {
  test('uses support-scoped hosted API description', () => {
    withGeneratedSpec((spec) => {
      const description = spec.info.description || '';

      expect(description).not.toContain('One API for every prediction market');
      expect(description).not.toContain('complete venue surface');
      expect(description).toContain('One API for supported prediction markets');
      expect(description).toContain('venue-native trading where venues expose writes');
    });
  });

  test('use SDK class names exported by TypeScript and Python packages', () => {
    withGeneratedSpec((spec) => {
      const typescriptExports = collectTypescriptExports(
        fs.readFileSync(typescriptIndexPath, 'utf8'),
      );
      const pythonExports = collectPythonAll(fs.readFileSync(pythonInitPath, 'utf8'));
      const typescriptSampleNames = collectSampleClassNames(spec, 'javascript');
      const pythonSampleNames = collectSampleClassNames(spec, 'python');

      expect(typescriptSampleNames).toContain('PolymarketUS');
      expect(typescriptSampleNames).toContain('SuiBets');
      expect(typescriptSampleNames).not.toContain('PolymarketUs');
      expect(typescriptSampleNames).not.toContain('Suibets');
      expect(pythonSampleNames).toContain('PolymarketUS');
      expect(pythonSampleNames).toContain('SuiBets');
      expect(pythonSampleNames).not.toContain('PolymarketUs');
      expect(pythonSampleNames).not.toContain('Suibets');

      const missingTypescript = typescriptSampleNames
        .filter((name) => !typescriptExports.has(name));
      const missingPython = pythonSampleNames
        .filter((name) => !pythonExports.has(name));

      expect(missingTypescript).toEqual([]);
      expect(missingPython).toEqual([]);
    });
  });

  test('exclude internal Mock SDK constructors from public OpenAPI samples', () => {
    withGeneratedSpec((spec) => {
      const constructors = spec['x-sdk-constructors'] || {};
      const samples = collectAllCodeSamples(spec);

      expect(Object.keys(constructors)).not.toContain('mock');
      expect(collectSampleClassNames(spec, 'javascript')).not.toContain('Mock');
      expect(collectSampleClassNames(spec, 'python')).not.toContain('Mock');

      for (const sample of samples) {
        expect(sample.label).not.toBe('Mock');
        expect(sample.source).not.toContain('pmxt.Mock');
        expect(sample.source).not.toContain('import { Mock }');
        expect(sample.source).not.toContain('new Mock');
      }
    });
  });

  test('reserve Router samples for router-backed OpenAPI operations', () => {
    withGeneratedSpec((spec) => {
      expect(collectOperationSampleLabels(spec, 'loadMarkets')).not.toContain('Router');
      expect(collectOperationSampleLabels(spec, 'fetchBalance')).not.toContain('Router');
      expect(collectOperationSampleLabels(spec, 'fetchOrderBook')).not.toContain('Router');

      const routerLabels = collectOperationSampleLabels(spec, 'fetchMarketMatches');
      expect(routerLabels).toEqual(['Router', 'Router']);
    });
  });

  test('include current public read venues in market and event samples', () => {
    withGeneratedSpec((spec) => {
      const currentPublicVenues = ['Hyperliquid', 'GeminiTitan', 'Hunch'];
      const marketLabels = collectOperationSampleLabels(spec, 'fetchMarkets');
      const eventLabels = collectOperationSampleLabels(spec, 'fetchEvents');

      expect(marketLabels).toEqual(expect.arrayContaining(currentPublicVenues));
      expect(eventLabels).toEqual(expect.arrayContaining(currentPublicVenues));
    });
  });

  test('use positional SDK calls for order-book samples', () => {
    withGeneratedSpec((spec) => {
      const fetchBookTypeScript = collectOperationSamples(spec, 'fetchOrderBook', 'javascript');
      const fetchBooksTypeScript = collectOperationSamples(spec, 'fetchOrderBooks', 'javascript');
      const fetchBookPython = collectOperationSamples(spec, 'fetchOrderBook', 'python');
      const fetchBooksPython = collectOperationSamples(spec, 'fetchOrderBooks', 'python');

      expect(fetchBookTypeScript.length).toBeGreaterThan(0);
      expect(fetchBooksTypeScript.length).toBeGreaterThan(0);
      expect(fetchBookPython.length).toBeGreaterThan(0);
      expect(fetchBooksPython.length).toBeGreaterThan(0);

      for (const sample of fetchBookTypeScript) {
        expect(sample).toContain('const result = await exchange.fetchOrderBook(');
        expect(sample).toContain('"67890"');
        expect(sample).not.toContain('exchange.fetchOrderBook({');
      }

      for (const sample of fetchBooksTypeScript) {
        expect(sample).toContain('const result = await exchange.fetchOrderBooks(["67890"]);');
        expect(sample).not.toContain('exchange.fetchOrderBooks();');
      }

      for (const sample of fetchBookPython) {
        expect(sample).toContain('result = exchange.fetch_order_book(');
        expect(sample).toContain('"67890"');
        expect(sample).not.toContain('outcome_id=');
      }

      for (const sample of fetchBooksPython) {
        expect(sample).toContain('result = exchange.fetch_order_books(["67890"])');
        expect(sample).not.toContain('exchange.fetch_order_books()');
      }
    });
  });

  test('use positional TypeScript SDK calls for positional OpenAPI methods', () => {
    withGeneratedSpec((spec) => {
      const exampleAddress = '0x1111111111111111111111111111111111111111';
      const positionalExpectations = [
        ['fetchOrder', 'const result = await exchange.fetchOrder("ord-001");', 'exchange.fetchOrder({'],
        ['cancelOrder', 'const result = await exchange.cancelOrder("ord-001");', 'exchange.cancelOrder({'],
        ['fetchOpenOrders', 'const result = await exchange.fetchOpenOrders("12345");', 'exchange.fetchOpenOrders({'],
        ['fetchPositions', `const result = await exchange.fetchPositions("${exampleAddress}");`, 'exchange.fetchPositions({'],
        ['fetchBalance', `const result = await exchange.fetchBalance("${exampleAddress}");`, 'exchange.fetchBalance({'],
      ];

      for (const [operationId, expected, unexpected] of positionalExpectations) {
        const samples = collectOperationSamples(spec, operationId, 'javascript');
        expect(samples.length).toBeGreaterThan(0);
        for (const sample of samples) {
          expect(sample).toContain(expected);
          expect(sample).not.toContain(unexpected);
          expect(sample).not.toContain('0xabc...');
        }
      }

      for (const sample of collectOperationSamples(spec, 'fetchOHLCV', 'javascript')) {
        expect(sample).toContain('const result = await exchange.fetchOHLCV(');
        expect(sample).toContain('"67890",');
        expect(sample).toContain('start: new Date("2026-01-01T00:00:00Z"),');
        expect(sample).toContain('end: new Date("2026-01-31T00:00:00Z"),');
        expect(sample).not.toContain('exchange.fetchOHLCV({');
      }

      for (const sample of collectOperationSamples(spec, 'fetchTrades', 'javascript')) {
        expect(sample).toContain('const result = await exchange.fetchTrades(');
        expect(sample).toContain('"67890",');
        expect(sample).toContain('start: new Date("2026-01-01T00:00:00Z"),');
        expect(sample).toContain('end: new Date("2026-01-31T00:00:00Z"),');
        expect(sample).not.toContain('exchange.fetchTrades({');
      }
    });
  });

  test('use concrete order books for execution-price SDK samples', () => {
    withGeneratedSpec((spec) => {
      const executionPriceTypeScript = collectOperationSamples(spec, 'getExecutionPrice', 'javascript');
      const detailedTypeScript = collectOperationSamples(spec, 'getExecutionPriceDetailed', 'javascript');
      const executionPricePython = collectOperationSamples(spec, 'getExecutionPrice', 'python');
      const detailedPython = collectOperationSamples(spec, 'getExecutionPriceDetailed', 'python');

      expect(executionPriceTypeScript.length).toBeGreaterThan(0);
      expect(detailedTypeScript.length).toBeGreaterThan(0);
      expect(executionPricePython.length).toBeGreaterThan(0);
      expect(detailedPython.length).toBeGreaterThan(0);

      for (const sample of executionPriceTypeScript) {
        expect(sample).toContain('const orderBook = {');
        expect(sample).toContain('const result = exchange.getExecutionPrice(orderBook, "buy", 10);');
        expect(sample).not.toContain('await exchange.getExecutionPrice({');
        expect(sample).not.toContain('orderBook: "orderBook"');
      }

      for (const sample of detailedTypeScript) {
        expect(sample).toContain('const orderBook = {');
        expect(sample).toContain('const result = await exchange.getExecutionPriceDetailed(orderBook, "buy", 10);');
        expect(sample).not.toContain('exchange.getExecutionPriceDetailed({');
        expect(sample).not.toContain('orderBook: "orderBook"');
      }

      for (const sample of executionPricePython) {
        expect(sample).toContain('order_book = pmxt.OrderBook(');
        expect(sample).toContain('result = exchange.get_execution_price(order_book, "buy", 10)');
        expect(sample).not.toContain('order_book="orderBook"');
      }

      for (const sample of detailedPython) {
        expect(sample).toContain('order_book = pmxt.OrderBook(');
        expect(sample).toContain('result = exchange.get_execution_price_detailed(order_book, "buy", 10)');
        expect(sample).not.toContain('order_book="orderBook"');
      }
    });
  });

  test('include outcome ids in submit-order build samples', () => {
    withGeneratedSpec((spec) => {
      const submitTypeScript = collectOperationSamples(spec, 'submitOrder', 'javascript');
      const submitPython = collectOperationSamples(spec, 'submitOrder', 'python');

      expect(submitTypeScript.length).toBeGreaterThan(0);
      expect(submitPython.length).toBeGreaterThan(0);

      for (const sample of submitTypeScript) {
        expect(sample).toContain(
          'const built = await exchange.buildOrder({ marketId: "12345", outcomeId: "67890"',
        );
      }

      for (const sample of submitPython) {
        expect(sample).toContain(
          'built = exchange.build_order(market_id="12345", outcome_id="67890"',
        );
      }
    });
  });

  test('use curated examples for market and event list filters', () => {
    withGeneratedSpec((spec) => {
      const operationIds = ['fetchMarkets', 'fetchEvents'];

      for (const operationId of operationIds) {
        const typeScriptSamples = collectOperationSamples(spec, operationId, 'javascript');
        const pythonSamples = collectOperationSamples(spec, operationId, 'python');

        expect(typeScriptSamples.length).toBeGreaterThan(0);
        expect(pythonSamples.length).toBeGreaterThan(0);

        for (const sample of typeScriptSamples) {
          expect(sample).toContain('query: "election"');
          expect(sample).toContain('limit: 10');
          expect(sample).not.toContain('sourceExchange: "value"');
          expect(sample).not.toContain('series: "value"');
          expect(sample).not.toContain('filter: "value"');
          expect(sample).not.toContain('category: "value"');
        }

        for (const sample of pythonSamples) {
          expect(sample).toContain('query="election"');
          expect(sample).toContain('limit=10');
          expect(sample).not.toContain('source_exchange="value"');
          expect(sample).not.toContain('series="value"');
          expect(sample).not.toContain('filter="value"');
          expect(sample).not.toContain('category="value"');
        }
      }
    });
  });

  test('use SDK-native date-time values for date filter samples', () => {
    withGeneratedSpec((spec) => {
      const sinceUntilOperationIds = ['fetchMyTrades', 'fetchClosedOrders', 'fetchAllOrders'];
      const startEndOperationIds = ['fetchOHLCV', 'fetchTrades'];

      for (const operationId of sinceUntilOperationIds) {
        const typeScriptSamples = collectOperationSamples(spec, operationId, 'javascript');
        const pythonSamples = collectOperationSamples(spec, operationId, 'python');

        expect(typeScriptSamples.length).toBeGreaterThan(0);
        expect(pythonSamples.length).toBeGreaterThan(0);

        for (const sample of typeScriptSamples) {
          expect(sample).not.toContain('since: "value"');
          expect(sample).not.toContain('until: "value"');
          expect(sample).toContain('since: "2026-01-01T00:00:00Z"');
          expect(sample).toContain('until: "2026-01-31T00:00:00Z"');
        }

        for (const sample of pythonSamples) {
          expect(sample).not.toContain('since="value"');
          expect(sample).not.toContain('until="value"');
          expect(sample).toContain('since="2026-01-01T00:00:00Z"');
          expect(sample).toContain('until="2026-01-31T00:00:00Z"');
        }
      }

      for (const operationId of startEndOperationIds) {
        const typeScriptSamples = collectOperationSamples(spec, operationId, 'javascript');
        const pythonSamples = collectOperationSamples(spec, operationId, 'python');

        expect(typeScriptSamples.length).toBeGreaterThan(0);
        expect(pythonSamples.length).toBeGreaterThan(0);

        for (const sample of typeScriptSamples) {
          expect(sample).not.toContain('start: "value"');
          expect(sample).not.toContain('end: "value"');
          expect(sample).toContain('start: new Date("2026-01-01T00:00:00Z")');
          expect(sample).toContain('end: new Date("2026-01-31T00:00:00Z")');
        }

        for (const sample of pythonSamples) {
          expect(sample).not.toContain('start="value"');
          expect(sample).not.toContain('end="value"');
          if (operationId === 'fetchOHLCV') {
            expect(sample).toContain('start=datetime(2026, 1, 1, tzinfo=timezone.utc)');
            expect(sample).toContain('end=datetime(2026, 1, 31, tzinfo=timezone.utc)');
          } else {
            expect(sample).toContain('start="2026-01-01T00:00:00Z"');
            expect(sample).toContain('end="2026-01-31T00:00:00Z"');
          }
        }
      }
    });
  });

  test('use curated FeedClient samples for data feed endpoints', () => {
    withGeneratedSpec((spec) => {
      const feedClientOperationIds = [
        'feedLoadMarkets',
        'feedFetchTicker',
        'feedFetchTickers',
        'feedFetchOHLCV',
        'feedFetchOracleRound',
        'feedFetchOracleHistory',
        'feedFetchHistoricalPrices',
      ];

      for (const operationId of feedClientOperationIds) {
        const typeScriptSamples = collectOperationSamples(spec, operationId, 'javascript');
        const pythonSamples = collectOperationSamples(spec, operationId, 'python');

        expect(typeScriptSamples.length).toBe(1);
        expect(pythonSamples.length).toBe(1);
        expect(typeScriptSamples[0]).toContain('FeedClient');
        expect(pythonSamples[0]).toContain('FeedClient');
        expect(typeScriptSamples[0]).not.toContain('exchange.feed');
        expect(pythonSamples[0]).not.toContain('exchange.feed_');
      }

      const feedListTypeScript = collectOperationSamples(spec, 'feedList', 'javascript');
      const feedListPython = collectOperationSamples(spec, 'feedList', 'python');
      const orderBookTypeScript = collectOperationSamples(spec, 'feedFetchOrderBook', 'javascript');
      const orderBookPython = collectOperationSamples(spec, 'feedFetchOrderBook', 'python');
      const watchTickerTypeScript = collectOperationSamples(spec, 'feedWatchTicker', 'javascript');
      const watchTickerPython = collectOperationSamples(spec, 'feedWatchTicker', 'python');

      expect(feedListTypeScript).toEqual([
        expect.stringContaining('fetch("https://api.pmxt.dev/api/feeds"'),
      ]);
      expect(feedListPython).toEqual([
        expect.stringContaining('requests.get('),
      ]);
      expect(orderBookTypeScript).toEqual([
        expect.stringContaining('/api/feeds/binance/fetchOrderBook'),
      ]);
      expect(orderBookPython).toEqual([
        expect.stringContaining('/api/feeds/binance/fetchOrderBook'),
      ]);
      expect(watchTickerTypeScript).toEqual([
        expect.stringContaining('new WebSocket("wss://api.pmxt.dev/ws?apiKey=YOUR_PMXT_API_KEY")'),
      ]);
      expect(watchTickerPython).toEqual([
        expect.stringContaining('websockets.connect(url)'),
      ]);

      const allFeedSamples = [
        ...feedClientOperationIds,
        'feedList',
        'feedFetchOrderBook',
        'feedWatchTicker',
      ].flatMap((operationId) => [
        ...collectOperationSamples(spec, operationId, 'javascript'),
        ...collectOperationSamples(spec, operationId, 'python'),
      ]);

      for (const sample of allFeedSamples) {
        expect(sample).not.toContain('symbols="value"');
        expect(sample).not.toContain('symbols: "value"');
        expect(sample).not.toContain('timeframe="value"');
        expect(sample).not.toContain('timeframe: "value"');
        expect(sample).not.toContain('feed="value"');
        expect(sample).not.toContain('feed: "value"');
      }
    });
  });

  test('omit generic filter placeholders from paginated list samples', () => {
    withGeneratedSpec((spec) => {
      const operationIds = ['fetchMarketsPaginated', 'fetchEventsPaginated'];

      for (const operationId of operationIds) {
        const typeScriptSamples = collectOperationSamples(spec, operationId, 'javascript');
        const pythonSamples = collectOperationSamples(spec, operationId, 'python');

        expect(typeScriptSamples.length).toBeGreaterThan(0);
        expect(pythonSamples.length).toBeGreaterThan(0);

        for (const sample of typeScriptSamples) {
          expect(sample).toContain('limit: 10');
          expect(sample).toContain('cursor: "abc123"');
          expect(sample).not.toContain('filter: "value"');
        }

        for (const sample of pythonSamples) {
          expect(sample).toContain('limit=10');
          expect(sample).toContain('cursor="abc123"');
          expect(sample).not.toContain('filter="value"');
        }
      }
    });
  });
});
