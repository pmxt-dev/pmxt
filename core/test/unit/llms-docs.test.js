const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const llmsPath = path.join(repoRoot, 'docs/llms.txt');
const llmsFullPath = path.join(repoRoot, 'docs/llms-full.txt');
const supportedVenuesPath = path.join(repoRoot, 'docs/concepts/venues.mdx');
const generatedPaths = [llmsPath, llmsFullPath];

const namedVenueCount = 4;

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

describe('LLMS docs generation', () => {
  test('keeps checked-in LLMS docs synced with user-facing venue docs', () => {
    const snapshot = snapshotGeneratedFiles();
    let generated;
    try {
      execFileSync(process.execPath, ['scripts/generate-llms.js'], {
        cwd: repoRoot,
        stdio: 'pipe',
      });

      generated = new Map(
        generatedPaths.map((filePath) => [filePath, fs.readFileSync(filePath, 'utf8')]),
      );
    } finally {
      restoreGeneratedFiles(snapshot);
    }

    for (const [filePath, contents] of snapshot) {
      expect(generated.get(filePath)).toBe(contents);
    }

    const llmsFull = snapshot.get(llmsFullPath);
    const llmsIndex = snapshot.get(llmsPath);
    const supportedVenues = fs.readFileSync(supportedVenuesPath, 'utf8');
    const introduction = fs.readFileSync(path.join(repoRoot, 'docs/introduction.mdx'), 'utf8');
    const quickstart = fs.readFileSync(path.join(repoRoot, 'docs/quickstart.mdx'), 'utf8');
    const routerOverview = fs.readFileSync(path.join(repoRoot, 'docs/router/overview.mdx'), 'utf8');
    const routerPrices = fs.readFileSync(path.join(repoRoot, 'docs/router/prices.mdx'), 'utf8');
    const routerSearch = fs.readFileSync(path.join(repoRoot, 'docs/router/search.mdx'), 'utf8');
    const selfHosted = fs.readFileSync(path.join(repoRoot, 'docs/guides/self-hosted.mdx'), 'utf8');
    const security = fs.readFileSync(path.join(repoRoot, 'docs/security.mdx'), 'utf8');
    const apiErrors = fs.readFileSync(path.join(repoRoot, 'docs/api-reference/errors.mdx'), 'utf8');
    const tradingQuickstart = fs.readFileSync(path.join(repoRoot, 'docs/trading-quickstart.mdx'), 'utf8');
    const hostedTrading = fs.readFileSync(path.join(repoRoot, 'docs/concepts/hosted-trading.mdx'), 'utf8');
    const escrowLifecycle = fs.readFileSync(
      path.join(repoRoot, 'docs/guides/escrow-lifecycle.mdx'),
      'utf8',
    );
    const migrateToHostedTrading = fs.readFileSync(
      path.join(repoRoot, 'docs/guides/migrate-to-hosted-trading.mdx'),
      'utf8',
    );
    const predictionMarkets101 = fs.readFileSync(
      path.join(repoRoot, 'docs/concepts/prediction-markets-101.mdx'),
      'utf8',
    );
    const rateLimits = fs.readFileSync(path.join(repoRoot, 'docs/rate-limits.mdx'), 'utf8');
    const hostedWriteDocs = `${selfHosted}\n${tradingQuickstart}\n${hostedTrading}\n${llmsFull}`;
    const hostedFundingDocs = `${hostedTrading}\n${escrowLifecycle}\n${llmsFull}`;
    const hostedAccountDocs = `${llmsIndex}\n${llmsFull}`;
    const hostedIdentifierDocs = `${hostedTrading}\n${migrateToHostedTrading}\n${llmsFull}`;
    const hostedSecurityDocs = `${security}\n${apiErrors}\n${llmsFull}`;
    const predictionMarkets101Docs = `${predictionMarkets101}\n${llmsFull}`;
    const rateLimitDocs = `${rateLimits}\n${llmsFull}`;
    const fetchOhlcv = fs.readFileSync(path.join(repoRoot, 'docs/api-reference/fetch-ohlcv.mdx'), 'utf8');
    const ohlcvDocs = `${fetchOhlcv}\n${llmsFull}`;
    const routerScopeDocs = `${introduction}\n${quickstart}\n${routerOverview}\n${routerSearch}\n${llmsIndex}\n${llmsFull}`;
    const routerPriceScopeDocs = `${routerOverview}\n${routerPrices}\n${llmsFull}`;
    const routerComposeDocs = `${introduction}\n${routerOverview}\n${routerPrices}\n${llmsFull}`;
    const topLevelTaglineDocs = `${introduction}\n${llmsIndex}\n${llmsFull}`;
    const introductionVenueScopeDocs = `${introduction}\n${llmsFull}`;
    const quickstartScopeDocs = `${quickstart}\n${llmsFull}`;
    const venueRows = Array.from(
      supportedVenues.matchAll(/^\| [^|]+ \| `[^`]+` \| `POST \/api\/[^`]+\/:method` \|$/gm),
    );
    const additionalVenueCount = venueRows.length - namedVenueCount;
    const additionalVenuePhrase = `${additionalVenueCount} more venues`;
    const expectedRows = [
      '| Gemini Titan | `gemini-titan` |',
      '| Hyperliquid | `hyperliquid` |',
      '| SuiBets | `suibets` |',
      '| Rain | `rain` |',
      '| Hunch | `hunch` |',
    ];

    for (const row of expectedRows) {
      expect(llmsFull).toContain(row);
    }

    expect(llmsFull).toContain('PMXT currently supports the following venue targets.');
    expect(llmsFull).not.toContain('| gemini-titan | `gemini-titan` |');
    expect(llmsFull).not.toContain('| hyperliquid | `hyperliquid` |');
    expect(llmsFull).not.toContain('| rain | `rain` |');
    expect(llmsFull).not.toContain('| hunch | `hunch` |');
    expect(llmsFull).not.toContain('| mock | `mock` |');
    expect(llmsFull).not.toContain('| Router | `router` |');

    expect(llmsIndex).toContain('https://pmxt.dev/docs/api-reference/createOrderHosted');
    expect(llmsIndex).toContain('https://pmxt.dev/docs/api-reference/fetchBalanceHosted');
    expect(llmsFull).toContain('`POST /v0/trade/create-order`');
    expect(llmsFull).toContain('`POST /v0/trade/build-order`');
    expect(llmsFull).toContain('`POST /v0/trade/submit-order`');
    expect(llmsFull).toContain('`POST /v0/orders/cancel/build`');
    expect(llmsFull).toContain('`GET /v0/orders/{order_id}`');
    expect(llmsFull).toContain('`GET /v0/user/{address}/balances`');

    expect(venueRows.length).toBeGreaterThan(namedVenueCount);
    expect(introduction).toContain(`Smarkets, and [${additionalVenuePhrase}](/concepts/venues).`);
    expect(routerOverview).toContain('hosted catalog venues');
    expect(llmsIndex).toContain(`Smarkets, and ${additionalVenuePhrase}.`);
    expect(llmsFull).toContain(`Smarkets, and ${additionalVenuePhrase}.`);
    expect(topLevelTaglineDocs).not.toContain('One API for every prediction market');
    expect(topLevelTaglineDocs).toContain('One API for supported prediction markets');
    expect(introductionVenueScopeDocs).not.toContain('Same methods, same response shape, every venue');
    expect(introductionVenueScopeDocs).not.toContain(
      "`create_order`, `fetch_positions` work identically whether you're on",
    );
    expect(introductionVenueScopeDocs).not.toContain(
      'open, resolve, and re-price across every venue',
    );
    expect(introductionVenueScopeDocs).not.toMatch(
      /Same\s+SDK methods, same response shape, regardless of which venue/,
    );
    expect(introductionVenueScopeDocs).not.toContain(
      'methods and response shapes stay the same',
    );
    expect(introductionVenueScopeDocs).toContain('support varying by venue');
    expect(introductionVenueScopeDocs).toContain('where the venue implements them');
    expect(introductionVenueScopeDocs).toContain('across supported venues');
    expect(introductionVenueScopeDocs).toMatch(
      /shared SDK method names and unified response shapes\s+where each venue supports/,
    );
    expect(introductionVenueScopeDocs).toMatch(/where that venue implements the\s+capability/);
    expect(introductionVenueScopeDocs).not.toContain('The code is identical either way:');
    expect(introductionVenueScopeDocs).not.toMatch(/SDKs work identically\s+against localhost or the hosted API/);
    expect(introductionVenueScopeDocs).toContain(
      'The SDK call shape is shared, but the runtime target changes:',
    );
    expect(introductionVenueScopeDocs).toContain(
      'Credentials and supported writes vary by mode.',
    );
    expect(`${introduction}\n${routerOverview}\n${llmsIndex}\n${llmsFull}`).not.toContain(
      '8 more venues',
    );
    expect(routerOverview).toContain('Results come from a shared catalog — ~10ms, not one call per venue.');
    expect(llmsFull).toContain('Results come from a shared catalog — ~10ms, not one call per venue.');
    expect(`${routerOverview}\n${llmsFull}`).not.toContain('11 sequential API calls');
    expect(`${routerOverview}\n${llmsFull}`).not.toContain('11 different APIs');
    expect(`${introduction}\n${llmsFull}`).not.toContain('querying 11 APIs sequentially is slow');
    expect(introduction).toContain('querying venue APIs sequentially is slow');
    expect(llmsFull).toContain('querying venue APIs sequentially is slow');
    expect(`${routerOverview}\n${llmsFull}`).not.toContain(
      'ingests markets, events, and outcomes from every venue PMXT supports',
    );
    expect(routerOverview).toContain(
      'ingests markets, events, and outcomes from the hosted catalog venues',
    );
    expect(llmsFull).toContain(
      'ingests markets, events, and outcomes from the hosted catalog venues',
    );
    expect(routerScopeDocs).not.toContain('Search every venue at once');
    expect(routerScopeDocs).not.toContain('unified view of every prediction market');
    expect(routerScopeDocs).not.toContain('One query fans out across every venue');
    expect(routerScopeDocs).not.toContain('Search events and markets across every venue in a single query');
    expect(routerScopeDocs).not.toContain('Search markets and events across every venue in a single query');
    expect(routerScopeDocs).toContain('Search catalog venues at once');
    expect(routerScopeDocs).toContain('across the hosted catalog');
    expect(quickstartScopeDocs).not.toContain('Polymarket, Kalshi, Limitless, or anywhere else');
    expect(quickstartScopeDocs).not.toContain('search everything');
    expect(quickstartScopeDocs).not.toContain(
      'Order books, trades, OHLCV, positions, balances, and trading — all via `POST /api/:exchange/:method`',
    );
    expect(quickstartScopeDocs).toContain('another hosted catalog venue');
    expect(quickstartScopeDocs).toContain('search the hosted catalog');
    expect(quickstartScopeDocs).toContain('supported where each venue implements them');
    expect(quickstart).not.toContain(
      'interface — same methods, same response shape, regardless of which venue',
    );
    expect(quickstart).not.toContain('The methods and response shapes are identical.');
    expect(quickstart).toMatch(/same method names and response shapes where the venue\s+supports them/);
    expect(quickstart).toContain('per-venue capabilities');
    expect(routerPriceScopeDocs).not.toContain('Side-by-side bid/ask for the same market on every venue');
    expect(routerPriceScopeDocs).toContain('identity matches in the hosted catalog');
    expect(routerComposeDocs).not.toContain('same `marketId`.');
    expect(routerComposeDocs).not.toContain('same schema — `marketId` works everywhere');
    expect(routerComposeDocs).not.toContain(
      'so `marketId`, `outcomes`, and all other fields work interchangeably',
    );
    expect(routerComposeDocs).not.toContain(
      'pass a `marketId` from the Router straight into\n' +
        "a venue exchange when you're ready to trade",
    );
    expect(routerComposeDocs).toContain('catalog IDs for Router and hosted flows');
    expect(routerComposeDocs).toContain('venue-native IDs for direct self-hosted writes');
    expect(routerComposeDocs).toContain('identifiers keep their address space');

    expect(hostedWriteDocs).not.toContain('Self-hosted writes work on every venue PMXT supports');
    expect(hostedWriteDocs).not.toContain(
      'Both modes expose the same SDK surface — the difference is where execution happens and who holds keys.',
    );
    expect(hostedWriteDocs).not.toContain('| **Trading venues** | Polymarket, Opinion, Limitless | Every venue PMXT supports |');
    expect(hostedWriteDocs).toContain('where the venue exposes writes');
    expect(hostedWriteDocs).toMatch(
      /Both modes use the same SDK classes and method names where the capability is\s+supported\./,
    );
    expect(hostedWriteDocs).toContain(
      'which write venues each mode supports.',
    );
    expect(hostedWriteDocs).toContain('Feature Support & Compliance');
    expect(hostedFundingDocs).not.toContain(
      'single Polygon-based `PreFundedEscrow` contract for every supported venue',
    );
    expect(hostedFundingDocs).not.toContain('and future venues');
    expect(hostedFundingDocs).not.toContain('single funding location for *every* hosted venue');
    expect(hostedFundingDocs).not.toContain('more coming');
    expect(hostedFundingDocs).not.toContain('the same key handles every venue');
    expect(hostedFundingDocs).not.toContain("serves every venue's payment leg");
    expect(hostedFundingDocs).toMatch(
      /same EVM wallet\/key can\s+trade the currently hosted\s+venues/,
    );
    expect(hostedFundingDocs).toMatch(
      /for the currently hosted trading venues \(Polymarket, Opinion, and\s+Limitless\)/,
    );
    expect(hostedFundingDocs).toContain(
      'serves the payment legs for Polymarket, Opinion, and Limitless',
    );
    expect(hostedAccountDocs).toContain('across Polymarket, Opinion, and Limitless');
    expect(hostedAccountDocs).toContain(
      'Place a buy or sell order on Polymarket, Opinion, or Limitless.',
    );
    expect(hostedAccountDocs).toContain(
      'Filter by `venue` to scope to Polymarket, Opinion, or Limitless.',
    );
    expect(hostedAccountDocs).not.toContain('across Polymarket and Opinion');
    expect(hostedAccountDocs).not.toContain('on Polymarket and Opinion');
    expect(hostedAccountDocs).not.toContain('Polymarket or Opinion');
    expect(hostedAccountDocs).not.toContain('scope to Polymarket or Opinion only');
    expect(hostedIdentifierDocs).not.toContain(
      'Every hosted endpoint speaks in **catalog UUIDs**, not venue-native IDs',
    );
    expect(hostedIdentifierDocs).not.toContain(
      'none of those work directly against `trade.pmxt.dev`',
    );
    expect(hostedIdentifierDocs).not.toContain(
      '`trade.pmxt.dev` requires **catalog UUIDs**, not Polymarket-native `conditionId` / `tokenId`',
    );
    expect(hostedIdentifierDocs).toContain('Catalog UUIDs are the shared address space');
    expect(hostedIdentifierDocs).toContain(
      'Raw REST can use catalog UUIDs or an explicit `venue` + `venue_outcome_id` pair',
    );
    expect(hostedIdentifierDocs).toContain(
      'Bare Polymarket `conditionId` / `tokenId` strings are not enough by themselves',
    );
    expect(hostedSecurityDocs).not.toContain('Catalog UUIDs, signatures, public wallet address');
    expect(hostedSecurityDocs).not.toContain(
      'with catalog UUIDs and parameters. No key, no signature yet.',
    );
    expect(hostedSecurityDocs).not.toContain(
      "What PMXT's server receives on the wire: catalog UUIDs, your public wallet address, and the signature.",
    );
    expect(hostedSecurityDocs).not.toContain(
      'you passed a **venue-native ID** to a hosted endpoint that expects a **catalog UUID**',
    );
    expect(hostedSecurityDocs).toContain(
      'Outcome target, signatures, public wallet address',
    );
    expect(hostedSecurityDocs).toContain(
      'with the outcome target and order parameters. The target is either a catalog UUID or a `venue` + `venue_outcome_id` pair.',
    );
    expect(hostedSecurityDocs).toContain(
      "What PMXT's server receives on the wire: the outcome target, your public wallet address, and the signature.",
    );
    expect(hostedSecurityDocs).toContain(
      'the backend could not resolve either a catalog UUID or a `venue` + `venue_outcome_id` pair',
    );
    expect(predictionMarkets101Docs).not.toContain(
      'venue-agnostic trading and read methods that work identically across every hosted venue',
    );
    expect(predictionMarkets101Docs).not.toContain(
      'The unified surface that makes PMXT a single SDK across venues',
    );
    expect(predictionMarkets101Docs).toContain(
      'shared trading and account method surface for venues that implement those capabilities',
    );
    expect(predictionMarkets101Docs).toContain('hosted write support is venue-specific');
    expect(rateLimitDocs).not.toContain('complete venue pass-through');
    expect(rateLimitDocs).toContain('supported venue pass-through');

    expect(ohlcvDocs).not.toContain('Kalshi, Limitless, and more are coming soon');
    expect(ohlcvDocs).not.toContain('Without an API key, OHLCV is limited to Polymarket');
    expect(fetchOhlcv).toContain('venues whose implementation supports `fetchOHLCV`');
    expect(fetchOhlcv).toContain('Feature Support & Compliance');
    expect(llmsFull).toContain('venues whose implementation supports `fetchOHLCV`');
  });
});
