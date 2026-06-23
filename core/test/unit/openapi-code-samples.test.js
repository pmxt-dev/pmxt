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

describe('OpenAPI SDK code samples', () => {
  test('use SDK class names exported by TypeScript and Python packages', () => {
    const snapshot = snapshotGeneratedFiles();
    let spec;
    try {
      execFileSync(process.execPath, ['scripts/generate-openapi.js'], {
        cwd: coreRoot,
        stdio: 'pipe',
      });

      spec = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
    } finally {
      restoreGeneratedFiles(snapshot);
    }

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
