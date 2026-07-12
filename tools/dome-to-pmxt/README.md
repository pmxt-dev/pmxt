# dome-to-pmxt

Automatic codemod to migrate DomeAPI code to pmxt. Supports both **TypeScript/JavaScript** and **Python**.

## Why?

DomeAPI is being sunset. This tool helps you automatically migrate your codebase to **pmxt**, which supports both Polymarket and Kalshi with a unified API.

See [pmxt as a Dome API alternative](https://pmxt.dev/dome-api-alternative) for a detailed comparison and migration guide.

## Installation

```bash
npm install -g dome-to-pmxt
# or
npx dome-to-pmxt
```

## Usage

```bash
# Transform a single file
dome-to-pmxt ./src/my-file.ts

# Transform a directory (recursively)
dome-to-pmxt ./src

# Transform both TS and Python files in a project
dome-to-pmxt ./
```

### Supported file types:
- **TypeScript/JavaScript:** `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`
- **Python:** `.py`

### Skipped directories:
`node_modules`, `.git`, `dist`, `build`, `__pycache__`, `.venv`, `venv`, `.next`, `coverage`

## What it migrates

### TypeScript/JavaScript

- Import statements: `@dome-api/sdk` → `pmxtjs`
- Constructor: `new DomeClient({...})` → `new pmxt.Polymarket()`
- Methods: `dome.polymarket.markets.getMarkets()` → `poly.fetchMarkets()`
- Parameters: `pagination_key` → `offset`, `token_id` → `outcomeId`, `status: 'open'` → `status: 'active'`
- Timestamps: `start_ts`, `end_ts` → `start`, `end` (with TODOs for manual adjustment)

### Python

Same transforms for Python imports and method calls.

## What needs manual work

The codemod adds `/* TODO(dome-to-pmxt): ... */` comments (JS) or `# TODO(dome-to-pmxt): ...` (Python) where semantic changes require manual review:

1. **Response shapes differ** — DomeAPI wraps markets in `{markets: [...]}`, pmxt returns arrays directly
2. **Price extraction** — DomeAPI has `getMarketPrice()` returning a price object; pmxt prices are in `market.outcomes[i].price`
3. **Pagination** — DomeAPI uses cursor-based (`pagination_key`), pmxt uses offset-based (`offset`)
4. **Timestamp handling** — DomeAPI expects unix seconds, pmxt expects `Date` objects

See [`../../docs/MIGRATE_FROM_DOMEAPI.md`](../../docs/MIGRATE_FROM_DOMEAPI.md) for detailed migration guide and examples.

## Example

**Before (DomeAPI):**
```typescript
import { DomeClient } from '@dome-api/sdk';

const dome = new DomeClient({ apiKey: 'your-key' });

async function main() {
  const markets = await dome.polymarket.markets.getMarkets({
    status: 'open',
    limit: 10
  });
  console.log(markets.markets.length);
}
```

**After running codemod:**
```typescript
import pmxt from 'pmxtjs';

const poly = /* TODO(dome-to-pmxt): new pmxt.Polymarket() or new pmxt.Kalshi() */ new pmxt.Polymarket();

async function main() {
  const markets = await poly.fetchMarkets({
    status: 'active',
    limit: 10
  });
  console.log(markets.length); // TODO: pmxt returns array directly
}
```

## Limitations

- The codemod handles common patterns but may miss edge cases
- Always review the transformed code and search for `TODO(dome-to-pmxt)` comments
- Test thoroughly against your actual API calls
- For complex migrations, refer to the full [migration guide](../../docs/MIGRATE_FROM_DOMEAPI.md)

## Next steps

1. Run the codemod on your project
2. Search for `TODO(dome-to-pmxt)` comments and fix them
3. Install `pmxt`: `npm install pmxtjs` (or `pip install pmxt`)
4. Update your code to handle the new API shapes and authentication (pmxt handles auth via environment variables)
5. Test with real API calls

## License

MIT
