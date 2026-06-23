const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');

function readDoc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function getFencedBlocks(markdown, language) {
  const blocks = [];
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = fencePattern.exec(markdown))) {
    const fenceLanguage = match[1].trim().split(/\s+/)[0].toLowerCase();
    if (fenceLanguage === language) {
      blocks.push(match[2]);
    }
  }
  return blocks;
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
});
