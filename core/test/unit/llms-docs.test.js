const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const llmsPath = path.join(repoRoot, 'docs/llms.txt');
const llmsFullPath = path.join(repoRoot, 'docs/llms-full.txt');
const generatedPaths = [llmsPath, llmsFullPath];

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
  });
});
