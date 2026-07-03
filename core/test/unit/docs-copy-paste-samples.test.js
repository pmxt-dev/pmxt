const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');

function readDoc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function getFencedBlocks(markdown, language) {
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;

  return Array.from(markdown.matchAll(fencePattern))
    .filter((match) => match[1].trim().split(/\s+/)[0].toLowerCase() === language)
    .map((match) => match[2]);
}

function findBlock(markdown, language, marker) {
  const block = getFencedBlocks(markdown, language).find((candidate) =>
    candidate.includes(marker),
  );

  if (!block) {
    throw new Error(`Could not find ${language} snippet containing ${marker}`);
  }

  return block;
}

describe('Documentation copy-paste samples', () => {
  test('standalone TypeScript pmxt namespace examples import the namespace they use', () => {
    const migrationGuide = readDoc('docs/MIGRATE_FROM_DOMEAPI.md');
    const authenticationGuide = readDoc('docs/authentication.mdx');
    const snippets = [
      findBlock(migrationGuide, 'typescript', 'privateKey: process.env.POLYMARKET_PRIVATE_KEY'),
      findBlock(migrationGuide, 'typescript', 'const limitless = new pmxt.Limitless();'),
      findBlock(authenticationGuide, 'typescript', 'pmxtApiKey: "pmxt_live_..."'),
    ];

    for (const snippet of snippets) {
      expect(snippet).toContain('import pmxt from');
      expect(snippet).toMatch(/\bnew pmxt\./);
    }
  });

  test('standalone Python pmxt namespace examples import the package they use', () => {
    const migrationGuide = readDoc('docs/MIGRATE_FROM_DOMEAPI.md');
    const authenticationGuide = readDoc('docs/authentication.mdx');
    const snippets = [
      findBlock(migrationGuide, 'python', "private_key=os.getenv('POLYMARKET_PRIVATE_KEY')"),
      findBlock(authenticationGuide, 'python', 'poly = pmxt.Polymarket(pmxt_api_key'),
    ];

    for (const snippet of snippets) {
      expect(snippet).toContain('import pmxt');
      expect(snippet).toContain('pmxt.Polymarket');
    }
  });

  test('standalone Python setup examples import pmxt before using the namespace', () => {
    const introduction = readDoc('docs/introduction.mdx');
    const configuration = readDoc('docs/api-reference/configuration.mdx');
    const selfHosted = readDoc('docs/guides/self-hosted.mdx');
    const signing = readDoc('docs/guides/signing.mdx');
    const readme = readDoc('readme.md');
    const pythonReadme = readDoc('sdks/python/README.md');
    const snippets = [
      findBlock(introduction, 'python', '# Self-hosted: SDK spawns pmxt-core on localhost'),
      findBlock(introduction, 'python', 'router = pmxt.Router'),
      findBlock(configuration, 'python', 'PMXT_BASE_URL'),
      findBlock(configuration, 'python', '# Minimum hosted trading config:'),
      findBlock(configuration, 'python', '# Self-hosted: no PMXT_API_KEY'),
      findBlock(selfHosted, 'python', 'pmxt.server.start()'),
      findBlock(selfHosted, 'python', 'pmxt.Limitless(private_key'),
      findBlock(selfHosted, 'python', 'pmxt.Smarkets(email='),
      findBlock(selfHosted, 'python', 'pmxt.Baozi(private_key='),
      findBlock(selfHosted, 'python', 'kalshi = pmxt.Kalshi(api_key_id='),
      findBlock(signing, 'python', 'read_only = pmxt.Polymarket'),
      findBlock(signing, 'python', 'signer=my_custom_signer'),
      findBlock(readme, 'python', "private_key=os.getenv('POLYMARKET_PRIVATE_KEY')"),
      findBlock(readme, 'python', "api_key=os.getenv('KALSHI_API_KEY')"),
      findBlock(readme, 'python', "api_key=os.getenv('LIMITLESS_API_KEY')"),
      findBlock(pythonReadme, 'python', 'auto_start_server=False'),
    ];

    for (const snippet of snippets) {
      expect(snippet).toContain('import pmxt');
    }
  });

  test('standalone TypeScript direct-class examples import the class they instantiate', () => {
    const signing = readDoc('docs/guides/signing.mdx');
    const snippet = findBlock(signing, 'typescript', 'signer: myCustomSigner');

    expect(snippet).toContain('import { Polymarket } from "pmxtjs";');
    expect(snippet).toContain('new Polymarket');
  });

  test('standalone Python README self-hosted examples import os before getenv use', () => {
    const readme = readDoc('readme.md');
    const snippets = [
      findBlock(readme, 'python', "private_key=os.getenv('POLYMARKET_PRIVATE_KEY')"),
      findBlock(readme, 'python', "api_key=os.getenv('KALSHI_API_KEY')"),
      findBlock(readme, 'python', "api_key=os.getenv('LIMITLESS_API_KEY')"),
    ];

    for (const snippet of snippets) {
      expect(snippet).toContain('import os');
      expect(snippet).toContain('os.getenv');
    }
  });

  test('root README TypeScript import guidance matches exported named classes', () => {
    const readme = readDoc('readme.md');
    const coreApiReference = readDoc('core/API_REFERENCE.md');

    expect(readme).toContain('import { Polymarket } from "pmxtjs";');
    expect(readme).not.toContain('Named imports do not work in ESM');
    expect(coreApiReference).toContain("import { Polymarket, Kalshi } from 'pmxtjs';");
    expect(coreApiReference).toContain('const polymarket = new Polymarket();');
    expect(coreApiReference).toContain('const polymarket = new pmxt.Polymarket();');
    expect(coreApiReference).not.toContain('const poly = new Polymarket();');
    expect(coreApiReference).not.toContain('const poly = new pmxt.Polymarket();');
    expect(coreApiReference).not.toContain('pmxt is currently CommonJS-only');
    expect(coreApiReference).not.toContain(
      "Named exports like `import { Polymarket } from 'pmxtjs'` will **not work** in ESM projects.",
    );
  });

  test('hosted TypeScript trading snippets do not require unsafe any casts', () => {
    const rootReadme = readDoc('readme.md');
    const typescriptReadme = readDoc('sdks/typescript/README.md');

    expect(rootReadme).toContain('slippage_pct: 30.0');
    expect(typescriptReadme).toContain('slippage_pct: 30.0');
    expect(rootReadme).not.toContain('} as any);');
    expect(typescriptReadme).not.toContain('} as any);');
  });

  test('root README scopes hosted trading venue support', () => {
    const readme = readDoc('readme.md');

    expect(readme).not.toContain('trade Polymarket, Kalshi, Opinion, and more from one API key');
    expect(readme).not.toContain(
      'Place orders across Polymarket, Kalshi, and Limitless with a single interface',
    );
    expect(readme).not.toContain(
      'pmxt supports unified trading across exchanges. The hosted API is the default',
    );
    expect(readme).toContain('Polymarket, Opinion, and Limitless writes today');
    expect(readme).toContain('self-host for venue-native writes such as Kalshi where supported');
    expect(readme).toContain('pmxt supports unified trading where venues expose writes');
    expect(readme).toContain('self-host when you need raw venue credentials');
  });

  test('SDK READMEs scope hosted custody to current hosted venues', () => {
    const typescriptReadme = readDoc('sdks/typescript/README.md');
    const pythonReadme = readDoc('sdks/python/README.md');
    const sdkReadmes = `${typescriptReadme}\n${pythonReadme}`;

    expect(sdkReadmes).toContain(
      'For Polymarket, Opinion, and Limitless, PMXT\'s PreFundedEscrow handles custody',
    );
    expect(sdkReadmes).not.toContain(
      'For Polymarket and Opinion, PMXT\'s PreFundedEscrow handles custody',
    );
  });

  test('hosted limit-order docs do not carry stale SDK denom mismatch caveats', () => {
    const tradingQuickstart = readDoc('docs/trading-quickstart.mdx');
    const hostedErrors = readDoc('docs/guides/hosted-errors.mdx');
    const hostedDocs = `${tradingQuickstart}\n${hostedErrors}`;

    expect(hostedDocs).not.toMatch(/limit BUY is (currently )?being patched for an SDK denom mismatch/);
    expect(hostedDocs).not.toContain('post limits via self-hosted');
    expect(tradingQuickstart).toContain('limit BUY and SELL are supported');
    expect(hostedErrors).toMatch(/Limit BUY and SELL are supported/);
  });

  test('hosted TypeScript error examples use typed fields without unsafe any casts', () => {
    const hostedErrors = readDoc('docs/guides/hosted-errors.mdx');
    const errorReference = readDoc('docs/api-reference/errors.mdx');
    const hostedErrorDocs = `${hostedErrors}\n${errorReference}`;

    expect(hostedErrorDocs).not.toContain('(e as any)');
    expect(hostedErrors).toContain('console.log(`Need to deposit. ${e.detail}`);');
    expect(errorReference).toContain('console.log(e.status, e.detail);');
  });

  test('TypeScript order shorthand docs use the public create-order input type', () => {
    const hostedErrors = readDoc('docs/guides/hosted-errors.mdx');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');

    expect(hostedErrors).toContain('import type { CreateOrderInput, Order } from "pmxtjs";');
    expect(hostedErrors).toContain('params: CreateOrderInput');
    expect(typescriptApiReference).toContain(
      'async createOrder(params: CreateOrderInput): Promise<Order>',
    );
    expect(typescriptApiReference).toContain(
      'async buildOrder(params: CreateOrderInput): Promise<BuiltOrder>',
    );
    expect(typescriptApiReference).toContain('type CreateOrderInput =');
    expect(typescriptApiReference).toContain('outcome: MarketOutcome;');
  });

  test('SDK API reference order examples include runnable parameters', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');

    expect(typescriptApiReference).not.toContain('await exchange.fetchOrderBooks("12345")');
    expect(typescriptApiReference).not.toContain('await exchange.createOrder()');
    expect(typescriptApiReference).not.toContain('await exchange.buildOrder()');
    expect(typescriptApiReference).not.toContain('await exchange.submitOrder("...")');
    expect(typescriptApiReference).not.toContain(
      'async createOrder(params: CreateOrderParams): Promise<Order>',
    );
    expect(typescriptApiReference).not.toContain(
      'async buildOrder(params: CreateOrderParams): Promise<BuiltOrder>',
    );

    expect(pythonApiReference).not.toContain('exchange.fetch_order_books(outcome_ids="12345")');
    expect(pythonApiReference).not.toContain('exchange.create_order()');
    expect(pythonApiReference).not.toContain('exchange.build_order()');
    expect(pythonApiReference).not.toContain('exchange.submit_order(built="...")');
    expect(pythonApiReference).not.toContain('List[string]');
    expect(pythonApiReference).not.toContain('Dictstr, [OrderBook]');

    expect(typescriptApiReference).toContain('await exchange.fetchOrderBooks(["12345"])');
    expect(typescriptApiReference).toContain(`await exchange.createOrder({
  marketId: "12345",
  outcomeId: "abc123",
  side: "buy",
  type: "limit",
  amount: 50,
  price: 0.65
})`);
    expect(typescriptApiReference).toContain(`const built = await exchange.buildOrder({
  marketId: "12345",
  outcomeId: "abc123",
  side: "buy",
  type: "limit",
  amount: 50,
  price: 0.65
});
await exchange.submitOrder(built)`);

    expect(pythonApiReference).toContain('exchange.fetch_order_books(outcome_ids=["12345"])');
    expect(pythonApiReference).toContain(
      'def fetch_order_books(outcome_ids: List[str]) -> Dict[str, OrderBook]:',
    );
    expect(pythonApiReference).toContain(`exchange.create_order(
    market_id="12345",
    outcome_id="abc123",
    side="buy",
    type="limit",
    amount=50,
    price=0.65,
)`);
    expect(pythonApiReference).toContain(`built = exchange.build_order(
    market_id="12345",
    outcome_id="abc123",
    side="buy",
    type="limit",
    amount=50,
    price=0.65,
)
exchange.submit_order(built)`);
  });

  test('SDK API reference positional examples match SDK method signatures', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');

    expect(typescriptApiReference).not.toContain(
      'await exchange.fetchOrderBook("abc123", { limit: 10, params: "..." })',
    );
    expect(typescriptApiReference).not.toContain(
      'await exchange.fetchOpenOrders({ marketId: "12345" })',
    );
    expect(typescriptApiReference).not.toContain(
      'await exchange.fetchPositions({ address: "0xabc..." })',
    );
    expect(typescriptApiReference).not.toContain(
      'await exchange.fetchBalance({ address: "0xabc..." })',
    );
    expect(typescriptApiReference).not.toContain(
      'await exchange.watchOrderBook("abc123", "...", { limit: 10 })',
    );
    expect(typescriptApiReference).not.toContain(
      'await exchange.watchOrderBooks(["12345"], "...", { limit: 10 })',
    );

    expect(pythonApiReference).not.toContain(
      'exchange.fetch_order_book(outcome_id="abc123", limit=10, params="...")',
    );
    expect(pythonApiReference).not.toContain(
      'exchange.watch_order_book(outcome_id="abc123", params="...", limit=10)',
    );
    expect(pythonApiReference).not.toContain(
      'exchange.watch_order_books(outcome_ids=["12345"], params="...", limit=10)',
    );

    expect(typescriptApiReference).toContain('await exchange.fetchOrderBook("abc123", 10, {})');
    expect(typescriptApiReference).toContain('await exchange.fetchOpenOrders("12345")');
    expect(typescriptApiReference).toContain('await exchange.fetchPositions("0xabc...")');
    expect(typescriptApiReference).toContain('await exchange.fetchBalance("0xabc...")');
    expect(typescriptApiReference).toContain('await exchange.watchOrderBook("abc123", 10, {})');
    expect(typescriptApiReference).toContain(
      'await exchange.watchOrderBooks(["12345"], 10, {})',
    );

    expect(pythonApiReference).toContain(
      'exchange.fetch_order_book(outcome_id="abc123", limit=10, params={})',
    );
    expect(pythonApiReference).toContain(
      'exchange.watch_order_book(outcome_id="abc123", limit=10, params={})',
    );
    expect(pythonApiReference).toContain(
      'exchange.watch_order_books(outcome_ids=["12345"], limit=10, params={})',
    );
  });

  test('SDK API reference object and list examples avoid string placeholders', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');

    expect(typescriptApiReference).not.toContain('await exchange.fetchOHLCV("abc123", "...")');
    expect(typescriptApiReference).not.toContain('await exchange.fetchTrades("abc123", "...")');
    expect(typescriptApiReference).not.toContain('await exchange.getExecutionPrice("...", "buy", 50)');
    expect(typescriptApiReference).not.toContain(
      'await exchange.getExecutionPriceDetailed("...", "buy", 50)',
    );
    expect(typescriptApiReference).not.toContain('await exchange.filterMarkets("...", "...")');
    expect(typescriptApiReference).not.toContain('await exchange.filterEvents("...", "...")');
    expect(typescriptApiReference).not.toContain(
      'await exchange.watchTrades("abc123", { address: "0xabc...", since: "..." })',
    );
    expect(typescriptApiReference).not.toContain(
      'await exchange.watchAddress("0xabc...", { types: "..." })',
    );

    expect(pythonApiReference).not.toContain('exchange.fetch_ohlcv(outcome_id="abc123", params="...")');
    expect(pythonApiReference).not.toContain('exchange.fetch_trades(outcome_id="abc123", params="...")');
    expect(pythonApiReference).not.toContain(
      'exchange.get_execution_price(order_book="...", side="buy", amount=50)',
    );
    expect(pythonApiReference).not.toContain(
      'exchange.get_execution_price_detailed(order_book="...", side="buy", amount=50)',
    );
    expect(pythonApiReference).not.toContain('exchange.filter_markets(markets="...", criteria="...")');
    expect(pythonApiReference).not.toContain('exchange.filter_events(events="...", criteria="...")');
    expect(pythonApiReference).not.toContain('exchange.watch_trades(outcome_id="abc123", address="0xabc...", since="...")');
    expect(pythonApiReference).not.toContain('exchange.watch_address(address="0xabc...", types="...")');

    expect(typescriptApiReference).toContain(
      'await exchange.fetchOHLCV("abc123", { resolution: "1h", limit: 100 })',
    );
    expect(typescriptApiReference).toContain('await exchange.fetchTrades("abc123", { limit: 50 })');
    expect(typescriptApiReference).toContain(`const orderBook = await exchange.fetchOrderBook("abc123")
exchange.getExecutionPrice(orderBook, "buy", 50)`);
    expect(typescriptApiReference).not.toContain('await exchange.getExecutionPrice(orderBook, "buy", 50)');
    expect(typescriptApiReference).toContain(
      "getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): number",
    );
    expect(typescriptApiReference).not.toContain(
      "async getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): Promise<number>",
    );
    expect(typescriptApiReference).not.toContain('**Returns:** Promise<number> - Average execution price');
    expect(typescriptApiReference).toContain(`const orderBook = await exchange.fetchOrderBook("abc123")
await exchange.getExecutionPriceDetailed(orderBook, "buy", 50)`);
    expect(typescriptApiReference).toContain(`const markets = await exchange.fetchMarkets({ query: "Trump" })
await exchange.filterMarkets(markets, "Trump")`);
    expect(typescriptApiReference).toContain(`const events = await exchange.fetchEvents({ query: "Trump" })
await exchange.filterEvents(events, "Trump")`);
    expect(typescriptApiReference).toContain(
      'await exchange.watchTrades("abc123", "0xabc...", 1710000000000, 50)',
    );
    expect(typescriptApiReference).toContain('await exchange.watchAddress("0xabc...", ["trades"])');

    expect(pythonApiReference).toContain(
      'exchange.fetch_ohlcv(outcome_id="abc123", resolution="1h", limit=100)',
    );
    expect(pythonApiReference).toContain('exchange.fetch_trades(outcome_id="abc123", limit=50)');
    expect(pythonApiReference).toContain(`order_book = exchange.fetch_order_book(outcome_id="abc123")
exchange.get_execution_price(order_book=order_book, side="buy", amount=50)`);
    expect(pythonApiReference).toContain(`order_book = exchange.fetch_order_book(outcome_id="abc123")
exchange.get_execution_price_detailed(order_book=order_book, side="buy", amount=50)`);
    expect(pythonApiReference).toContain(`markets = exchange.fetch_markets(query="Trump")
exchange.filter_markets(markets=markets, criteria="Trump")`);
    expect(pythonApiReference).toContain(`events = exchange.fetch_events(query="Trump")
exchange.filter_events(events=events, criteria="Trump")`);
    expect(pythonApiReference).toContain(
      'exchange.watch_trades(outcome_id="abc123", address="0xabc...", since=1710000000000, limit=50)',
    );
    expect(pythonApiReference).toContain('exchange.watch_address(address="0xabc...", types=["trades"])');
  });

  test('SDK API reference callback examples pass callables', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');

    expect(typescriptApiReference).not.toContain('await exchange.watchPrices("...", "...")');
    expect(typescriptApiReference).not.toContain('await exchange.watchUserPositions("...")');
    expect(typescriptApiReference).not.toContain('await exchange.watchUserTransactions("...")');

    expect(pythonApiReference).not.toContain(
      'exchange.watch_prices(market_address="...", callback="...")',
    );
    expect(pythonApiReference).not.toContain('exchange.watch_user_positions(callback="...")');
    expect(pythonApiReference).not.toContain('exchange.watch_user_transactions(callback="...")');
    expect(typescriptApiReference).not.toContain('callback: (data: any)): Promise<void>');
    expect(pythonApiReference).not.toContain('callback: (data: any)');
    expect(pythonApiReference).not.toContain('-> void:');

    expect(typescriptApiReference).toContain(
      'await exchange.watchPrices("0xabc...", (data) => { void data })',
    );
    expect(typescriptApiReference).toContain(
      'await exchange.watchUserPositions((data) => { void data })',
    );
    expect(typescriptApiReference).toContain(
      'await exchange.watchUserTransactions((data) => { void data })',
    );

    expect(pythonApiReference).toContain(`def handle_price_update(data):
    pass
exchange.watch_prices(market_address="0xabc...", callback=handle_price_update)`);
    expect(pythonApiReference).toContain(`def handle_position_update(data):
    pass
exchange.watch_user_positions(callback=handle_position_update)`);
    expect(pythonApiReference).toContain(`def handle_transaction_update(data):
    pass
exchange.watch_user_transactions(callback=handle_transaction_update)`);
    expect(pythonApiReference).toContain(
      'def watch_prices(market_address: str, callback: Callable[[Any], None]) -> None:',
    );
    expect(typescriptApiReference).toContain(
      'async watchPrices(marketAddress: string, callback: (data: any) => void): Promise<void>',
    );
  });

  test('Python API reference signatures render Python-native types', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');

    expect(pythonApiReference).not.toContain(
      'Optional[{ limit?: number; cursor?: string; filter?: MarketFilterCriteria }]',
    );
    expect(pythonApiReference).not.toContain('string | MarketFilterCriteria');
    expect(pythonApiReference).not.toContain('UnifiedEvent | null');
    expect(pythonApiReference).not.toContain("side: 'buy' | 'sell'");
    expect(pythonApiReference).not.toContain('get_event_byid');
    expect(pythonApiReference).not.toContain('get_event_byslug');

    expect(pythonApiReference).toContain(
      'def fetch_markets_paginated(params: Optional[dict] = None) -> PaginatedMarketsResult:',
    );
    expect(pythonApiReference).toContain(
      'def fetch_events_paginated(params: Optional[dict] = None) -> PaginatedEventsResult:',
    );
    expect(pythonApiReference).toContain(
      'def filter_markets(markets: List[UnifiedMarket], criteria: Union[str, MarketFilterCriteria, MarketFilterFunction]) -> List[UnifiedMarket]:',
    );
    expect(pythonApiReference).toContain(
      'def filter_events(events: List[UnifiedEvent], criteria: Union[str, EventFilterCriteria, EventFilterFunction]) -> List[UnifiedEvent]:',
    );
    expect(pythonApiReference).toContain(
      'def get_execution_price(order_book: OrderBook, side: Literal["buy", "sell"], amount: float) -> float:',
    );
    expect(pythonApiReference).toContain(
      'def get_event_by_id(id: str) -> Optional[UnifiedEvent]:',
    );
    expect(pythonApiReference).toContain(
      'def get_event_by_slug(slug: str) -> Optional[UnifiedEvent]:',
    );
  });

  test('SDK API reference getter docs use property access', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');

    expect(typescriptApiReference).not.toContain('async has(): Promise<ExchangeHas>');
    expect(typescriptApiReference).not.toContain('await exchange.has()');
    expect(typescriptApiReference).not.toContain('**Returns:** Promise<ExchangeHas> - Result');
    expect(typescriptApiReference).not.toContain('### `implicitApi`');

    expect(pythonApiReference).not.toContain('def has() -> ExchangeHas:');
    expect(pythonApiReference).not.toContain('exchange.has()');
    expect(pythonApiReference).not.toContain('### `implicit_api`');

    expect(typescriptApiReference).toContain('get has(): ExchangeHas');
    expect(typescriptApiReference).toContain('**Returns:** ExchangeHas - Result');
    expect(typescriptApiReference).toContain('exchange.has');
    expect(pythonApiReference).toContain('has: ExchangeHas');
    expect(pythonApiReference).toContain('exchange.has');
  });

  test('execution price docs await only async TypeScript helpers', () => {
    const coreApiReference = readDoc('core/API_REFERENCE.md');
    const typescriptExecutionExample = readDoc(
      'sdks/typescript/examples/market-data/execution_price.ts',
    );

    expect(coreApiReference).not.toContain(
      "const price = await polymarket.getExecutionPrice(orderBook, 'buy', 100);",
    );
    expect(coreApiReference).not.toContain(
      "const detailed = await polymarket.getExecutionPriceDetailed(orderBook, 'buy', 100);",
    );
    expect(coreApiReference).toContain(
      "const price = polymarket.getExecutionPrice(orderBook, 'buy', 100);",
    );
    expect(coreApiReference).toContain(
      "const detailed = polymarket.getExecutionPriceDetailed(orderBook, 'buy', 100);",
    );

    expect(typescriptExecutionExample).not.toContain(
      "const price = await api.getExecutionPrice(orderBook, 'buy', 100);",
    );
    expect(typescriptExecutionExample).toContain(
      "const price = api.getExecutionPrice(orderBook, 'buy', 100);",
    );
    expect(typescriptExecutionExample).toContain(
      "const detailed = await api.getExecutionPriceDetailed(orderBook, 'buy', 100);",
    );
  });

  test('core API reference uses current market lookup methods', () => {
    const coreApiReference = readDoc('core/API_REFERENCE.md');

    expect(coreApiReference).not.toContain('getMarketsBySlug');
    expect(coreApiReference).not.toContain('replaces searchMarkets');
    expect(coreApiReference).toContain("const market = await kalshi.fetchMarket({ slug: 'INVALID-TICKER' });");
  });

  test('core API reference describes the current venue scope', () => {
    const coreApiReference = readDoc('core/API_REFERENCE.md');

    expect(coreApiReference).not.toContain(
      'multiple prediction market exchanges (Kalshi, Polymarket) identically',
    );
    expect(coreApiReference).not.toContain(
      'Both Polymarket and Kalshi support authenticated trading operations.',
    );
    expect(coreApiReference).toContain(
      'multiple prediction market exchanges and venues through one interface',
    );
    expect(coreApiReference).toContain(
      'Authenticated trading is available on venues that expose trading APIs.',
    );
  });

  test('SDK entrypoints describe current venue scope and runnable examples', () => {
    const pythonEntrypoint = readDoc('sdks/python/pmxt/__init__.py');
    const typescriptEntrypoint = readDoc('sdks/typescript/index.ts');
    const documents = {
      pythonEntrypoint,
      typescriptEntrypoint,
    };
    const staleClaimsByDocument = {
      pythonEntrypoint: [
        'A unified interface for interacting with multiple prediction market exchanges',
        '(Kalshi, Polymarket) identically.',
        '>>> markets = await poly.fetch_markets(query="Trump")',
      ],
      typescriptEntrypoint: [
        'A unified interface for interacting with multiple prediction market exchanges',
        '(Kalshi, Polymarket) identically.',
      ],
    };
    const expectedClaimsByDocument = {
      pythonEntrypoint: [
        'A unified Python SDK for supported prediction markets',
        'local sidecar access to PMXT exchange implementations',
        'hosted services where configured.',
        '>>> markets = poly.fetch_markets(query="Trump")',
      ],
      typescriptEntrypoint: [
        'A unified TypeScript SDK for supported prediction markets',
        'local sidecar access to PMXT exchange implementations',
        'hosted services where configured.',
      ],
    };
    const staleOffenders = Object.entries(staleClaimsByDocument).flatMap(([name, claims]) =>
      claims
        .filter((claim) => documents[name].includes(claim))
        .map((claim) => `${name}: ${claim}`),
    );
    const missingCurrentClaims = Object.entries(expectedClaimsByDocument).flatMap(
      ([name, claims]) =>
        claims
          .filter((claim) => !documents[name].includes(claim))
          .map((claim) => `${name}: ${claim}`),
    );

    expect({
      staleOffenders,
      missingCurrentClaims,
    }).toEqual({
      staleOffenders: [],
      missingCurrentClaims: [],
    });
  });

  test('SDK READMEs describe current support scope', () => {
    const pythonReadme = readDoc('sdks/python/README.md');
    const typescriptReadme = readDoc('sdks/typescript/README.md');
    const staleClaimsByDocument = {
      pythonReadme: [
        'A unified Python interface for prediction market exchanges (Polymarket, Kalshi, Limitless, Opinion, and more).',
      ],
      typescriptReadme: [
        'A unified TypeScript/Node.js SDK for prediction markets — The ccxt for prediction markets.',
      ],
    };
    const expectedClaimsByDocument = {
      pythonReadme: [
        'A unified Python SDK for supported prediction markets.',
        'Hosted services are the default, with local sidecar access for self-hosted venue integrations.',
      ],
      typescriptReadme: [
        'A unified TypeScript/Node.js SDK for supported prediction markets.',
        'Hosted services are the default, with local sidecar access for self-hosted venue integrations.',
      ],
    };
    const documents = {
      pythonReadme,
      typescriptReadme,
    };
    const staleOffenders = Object.entries(staleClaimsByDocument).flatMap(([name, claims]) =>
      claims
        .filter((claim) => documents[name].includes(claim))
        .map((claim) => `${name}: ${claim}`),
    );
    const missingCurrentClaims = Object.entries(expectedClaimsByDocument).flatMap(
      ([name, claims]) =>
        claims
          .filter((claim) => !documents[name].includes(claim))
          .map((claim) => `${name}: ${claim}`),
    );

    expect({
      staleOffenders,
      missingCurrentClaims,
    }).toEqual({
      staleOffenders: [],
      missingCurrentClaims: [],
    });
  });

  test('package metadata descriptions use current support scope', () => {
    const corePackage = JSON.parse(readDoc('core/package.json'));
    const typescriptPackage = JSON.parse(readDoc('sdks/typescript/package.json'));
    const pythonProject = readDoc('sdks/python/pyproject.toml');
    const metadata = {
      corePackage: corePackage.description,
      typescriptPackage: typescriptPackage.description,
      pythonProject,
    };
    const staleOffenders = Object.entries(metadata)
      .filter(([, content]) => content.includes('The ccxt for prediction markets'))
      .map(([name]) => name);

    expect({
      staleOffenders,
      coreDescription: corePackage.description,
      typescriptDescription: typescriptPackage.description,
      pythonHasCurrentDescription: pythonProject.includes(
        'description = "SDK for supported prediction markets with hosted services and local sidecar access"',
      ),
    }).toEqual({
      staleOffenders: [],
      coreDescription: 'Local sidecar API for supported prediction markets.',
      typescriptDescription:
        'SDK for supported prediction markets with hosted services and local sidecar access',
      pythonHasCurrentDescription: true,
    });
  });

  test('SDK API references describe the current venue scope', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');
    const pythonApiReferenceTemplate = readDoc('scripts/templates/api-reference.python.md.hbs');
    const typescriptApiReferenceTemplate = readDoc(
      'scripts/templates/api-reference.typescript.md.hbs',
    );
    const documents = {
      pythonApiReference,
      pythonApiReferenceTemplate,
      typescriptApiReference,
      typescriptApiReferenceTemplate,
    };
    const staleDescription =
      'interacting with multiple prediction market exchanges (Polymarket, Kalshi, Limitless)';
    const expectedDescriptions = {
      pythonApiReference:
        'A unified Python SDK for supported prediction markets, with local sidecar access to PMXT exchange implementations and hosted services where configured.',
      pythonApiReferenceTemplate:
        'A unified Python SDK for supported prediction markets, with local sidecar access to PMXT exchange implementations and hosted services where configured.',
      typescriptApiReference:
        'A unified TypeScript SDK for supported prediction markets, with local sidecar access to PMXT exchange implementations and hosted services where configured.',
      typescriptApiReferenceTemplate:
        'A unified TypeScript SDK for supported prediction markets, with local sidecar access to PMXT exchange implementations and hosted services where configured.',
    };
    const staleOffenders = Object.entries(documents)
      .filter(([, content]) => content.includes(staleDescription))
      .map(([name]) => name);
    const missingCurrentDescriptions = Object.entries(expectedDescriptions)
      .filter(([name, description]) => !documents[name].includes(description))
      .map(([name]) => name);

    expect({
      staleOffenders,
      missingCurrentDescriptions,
    }).toEqual({
      staleOffenders: [],
      missingCurrentDescriptions: [],
    });
  });

  test('error handling guide describes supported venue scope', () => {
    const errorHandlingGuide = readDoc('core/docs/ERRORS.md');

    expect({
      hasStaleThreeVenueScope: errorHandlingGuide.includes(
        'unified error handling across all exchanges (Polymarket, Kalshi, Limitless)',
      ),
      hasSupportedVenueScope: errorHandlingGuide.includes(
        'unified error handling across supported exchanges and venues',
      ),
    }).toEqual({
      hasStaleThreeVenueScope: false,
      hasSupportedVenueScope: true,
    });
  });

  test('DomeAPI migration guide reflects current PMXT support scope', () => {
    const migrationGuide = readDoc('docs/MIGRATE_FROM_DOMEAPI.md');
    const readme = readDoc('readme.md');
    const staleClaims = [
      'DomeAPI is shutting down March 31, 2025.',
      '| **Exchanges** | Polymarket, Kalshi | Polymarket, Kalshi, Limitless, Probable, Baozi, Myriad |',
      'Some DomeAPI features have no direct pmxt equivalent:',
      '| Binance / Chainlink price feeds | Not available |',
      '| Historical orderbook snapshots | `watch_order_book()` for live data |',
      'DomeAPI provides historical orderbook snapshots. pmxt provides the current live order book.',
      '| Get order book | `GET /polymarket/orderbook-history?token_id=` | `fetchOrderBook(outcomeId)` | `fetch_order_book(outcome_id)` |',
      'pmxt gives you the same API across all supported exchanges:',
      '// Same methods on all exchanges',
    ];
    const staleReadmeClaims = [
      'pmxt is a drop-in replacement with a unified interface for Polymarket and Kalshi.',
    ];
    const expectedClaims = [
      'DomeAPI shut down on March 31, 2025.',
      '| **Exchanges** | Polymarket, Kalshi | Supported venue catalog (Polymarket, Kalshi, Limitless, Smarkets, Opinion, and more) |',
      '## Feature gaps and replacements',
      'Some DomeAPI features map to a different PMXT surface or have no direct equivalent:',
      '| Binance / Chainlink price feeds | Feed API via `FeedClient` and `/api/feeds/{feed}/...` endpoints |',
      '| Historical orderbook snapshots | Historical `fetch_order_book(..., params={...})` via PMXT Archive where supported; live `watch_order_book()` for streaming |',
      'DomeAPI historical orderbook snapshots map to PMXT Archive-backed `fetchOrderBook` / `fetch_order_book` with `since` / `until` params where supported; omit archive params for the current live order book.',
      '| Get order book history | `GET /polymarket/orderbook-history?token_id=` | `fetchOrderBook(outcomeId, undefined, { since, until, outcome })` | `fetch_order_book(outcome_id, params={...})` |',
      'pmxt uses the same method names across venues that implement each capability:',
      '// Same method names where each venue supports the capability',
    ];
    const expectedReadmeClaims = [
      "pmxt is a drop-in replacement for DomeAPI's Polymarket/Kalshi workflows",
      "also exposes PMXT's broader supported venue catalog where current capabilities exist",
    ];

    expect({
      staleClaims: [
        ...staleClaims
          .filter((claim) => migrationGuide.includes(claim))
          .map((claim) => `migrationGuide: ${claim}`),
        ...staleReadmeClaims
          .filter((claim) => readme.includes(claim))
          .map((claim) => `readme: ${claim}`),
      ],
      missingCurrentClaims: [
        ...expectedClaims
          .filter((claim) => !migrationGuide.includes(claim))
          .map((claim) => `migrationGuide: ${claim}`),
        ...expectedReadmeClaims
          .filter((claim) => !readme.includes(claim))
          .map((claim) => `readme: ${claim}`),
      ],
    }).toEqual({
      staleClaims: [],
      missingCurrentClaims: [],
    });
  });

  test('unified schema docs describe source-aware identifier semantics', () => {
    const unifiedSchema = readDoc('docs/concepts/unified-schema.mdx');
    const staleClaims = [
      '| `marketId`        | `string`          | Stable PMXT id (UUID).                                    |',
      '| `outcomeId`       | `string`           | Venue-native outcome id (token id, side id, ...).         |',
    ];
    const expectedClaims = [
      'Identifier semantics are source-aware:',
      'Router and hosted catalog rows use stable PMXT UUIDs for `marketId` and `outcomeId`.',
      'Venue clients and local pass-throughs may use venue-native identifiers.',
      'Do not assume every `marketId` / `outcomeId` is a UUID or every outcome id is venue-native.',
    ];

    expect({
      staleClaims: staleClaims.filter((claim) => unifiedSchema.includes(claim)),
      missingCurrentClaims: expectedClaims.filter((claim) => !unifiedSchema.includes(claim)),
    }).toEqual({
      staleClaims: [],
      missingCurrentClaims: [],
    });
  });

  test('catalog identifier docs avoid identical wire-path wording', () => {
    const catalogIdentifierGuide = readDoc('docs/concepts/catalog-uuid-vs-venue-id.mdx');

    expect({
      hasStaleIdenticalClaim: catalogIdentifierGuide.includes(
        '# Both of these work identically against trade.pmxt.dev:',
      ),
      hasScopedNoConversionClaim: catalogIdentifierGuide.includes(
        '# Both of these work against trade.pmxt.dev without a conversion step:',
      ),
    }).toEqual({
      hasStaleIdenticalClaim: false,
      hasScopedNoConversionClaim: true,
    });
  });

  test('SDK API references include account history and firehose methods', () => {
    const pythonApiReference = readDoc('sdks/python/API_REFERENCE.md');
    const typescriptApiReference = readDoc('sdks/typescript/API_REFERENCE.md');

    const expectedTypeScriptMethods = [
      '### `fetchMyTrades`',
      '### `fetchClosedOrders`',
      '### `fetchAllOrders`',
      '### `watchAllOrderBooks`',
      '### `firehose`',
    ];
    const expectedPythonMethods = [
      '### `fetch_my_trades`',
      '### `fetch_closed_orders`',
      '### `fetch_all_orders`',
      '### `watch_all_order_books`',
      '### `firehose`',
    ];

    for (const heading of expectedTypeScriptMethods) {
      expect(typescriptApiReference).toContain(heading);
    }

    for (const heading of expectedPythonMethods) {
      expect(pythonApiReference).toContain(heading);
    }

    expect(typescriptApiReference).toContain(
      'async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]>',
    );
    expect(typescriptApiReference).toContain(
      'async fetchClosedOrders(params?: OrderHistoryParams): Promise<Order[]>',
    );
    expect(typescriptApiReference).toContain(
      'async fetchAllOrders(params?: OrderHistoryParams): Promise<Order[]>',
    );
    expect(typescriptApiReference).toContain(
      'async watchAllOrderBooks(venues?: string[]): Promise<FirehoseEvent>',
    );
    expect(typescriptApiReference).toContain(
      'async firehose(venues?: string[]): Promise<FirehoseEvent>',
    );

    expect(pythonApiReference).toContain(
      'def fetch_my_trades(params: Optional[MyTradesParams] = None) -> List[UserTrade]:',
    );
    expect(pythonApiReference).toContain(
      'def fetch_closed_orders(params: Optional[OrderHistoryParams] = None) -> List[Order]:',
    );
    expect(pythonApiReference).toContain(
      'def fetch_all_orders(params: Optional[OrderHistoryParams] = None) -> List[Order]:',
    );
    expect(pythonApiReference).toContain(
      'def watch_all_order_books(venues: Optional[List[str]] = None) -> FirehoseEvent:',
    );
    expect(pythonApiReference).toContain(
      'def firehose(venues: Optional[List[str]] = None) -> FirehoseEvent:',
    );
  });
});
