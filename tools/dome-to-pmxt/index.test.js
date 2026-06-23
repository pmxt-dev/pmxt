import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const TOOL_PATH = path.resolve('tools/dome-to-pmxt/index.js');

function withFixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmxt-dome-codemod-'));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runCodemod(target, ...args) {
  return execFileSync(process.execPath, [TOOL_PATH, target, ...args], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
  });
}

test('rewrites JS DomeClient declarations to the poly alias used by Polymarket calls', () => {
  withFixture((dir) => {
    const fixture = path.join(dir, 'sample.jsx');
    fs.writeFileSync(
      fixture,
      [
        "import { DomeClient } from '@dome-api/sdk';",
        '',
        "const dome = new DomeClient({ apiKey: 'fixture-key' });",
        '',
        'export async function load() {',
        "  const firstPage = await dome.polymarket.markets.getMarkets({ status: 'open', pagination_key: 'abc' });",
        '  return firstPage.pagination.pagination_key;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    runCodemod(fixture);

    const migrated = fs.readFileSync(fixture, 'utf8');
    assert.match(migrated, /const poly = .*new pmxt\.Polymarket\(\);/);
    assert.match(migrated, /poly\.fetchMarkets\(/);
    assert.doesNotMatch(migrated, /const dome = .*new pmxt\.Polymarket\(\);/);
    assert.doesNotMatch(migrated, /\bdome\.polymarket\b/);
    assert.match(migrated, /firstPage\.pagination\.pagination_key/);
  });
});

test('rewrites Python DomeClient assignments to the poly alias used by Polymarket calls', () => {
  withFixture((dir) => {
    const fixture = path.join(dir, 'sample.py');
    fs.writeFileSync(
      fixture,
      [
        'from dome_api_sdk import DomeClient',
        '',
        'dome = DomeClient({})',
        'markets = dome.polymarket.markets.get_markets(status="open", pagination_key="abc")',
        '',
      ].join('\n'),
      'utf8',
    );

    runCodemod(fixture);

    const migrated = fs.readFileSync(fixture, 'utf8');
    assert.match(migrated, /poly = pmxt\.Polymarket\(\)/);
    assert.match(migrated, /poly\.fetch_markets\(/);
    assert.doesNotMatch(migrated, /dome = pmxt\.Polymarket\(\)/);
    assert.doesNotMatch(migrated, /\bdome\.polymarket\b/);
  });
});

test('skips dependency directories when transforming a project tree', () => {
  withFixture((dir) => {
    const source = path.join(dir, 'source.js');
    const ignoredDir = path.join(dir, 'node_modules');
    const ignored = path.join(ignoredDir, 'ignored.js');
    fs.mkdirSync(ignoredDir);
    fs.writeFileSync(source, "import { DomeClient } from '@dome-api/sdk';\nconst dome = new DomeClient();\n", 'utf8');
    fs.writeFileSync(ignored, "import { DomeClient } from '@dome-api/sdk';\nconst dome = new DomeClient();\n", 'utf8');

    runCodemod(dir);

    assert.match(fs.readFileSync(source, 'utf8'), /const poly = .*new pmxt\.Polymarket\(\);/);
    assert.match(fs.readFileSync(ignored, 'utf8'), /@dome-api\/sdk/);
    assert.match(fs.readFileSync(ignored, 'utf8'), /const dome = new DomeClient\(\);/);
  });
});

test('dry-run reports changes without rewriting files', () => {
  withFixture((dir) => {
    const fixture = path.join(dir, 'dry-run.js');
    const original = "import { DomeClient } from '@dome-api/sdk';\nconst dome = new DomeClient();\n";
    fs.writeFileSync(fixture, original, 'utf8');

    const output = runCodemod(fixture, '--dry-run');

    assert.match(output, /\[dry-run\]/);
    assert.equal(fs.readFileSync(fixture, 'utf8'), original);
  });
});
