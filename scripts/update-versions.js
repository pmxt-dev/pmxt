// Update package versions from git tag
// Usage: node update-versions.js <version>

const fs = require('fs');
const path = require('path');

const version = process.argv[2];

if (!version) {
    console.error('Error: Version argument required');
    process.exit(1);
}

console.log(`Input version: ${version}`);

// Helper to normalize for SemVer (NPM)
// Converts 1.0.0b1 -> 1.0.0-b1, 1.0.0rc1 -> 1.0.0-rc1
function toSemVer(v) {
    if (v.includes('-')) return v; // Already has hyphen
    // Match 1.0.0b1 pattern
    const match = v.match(/^(\d+\.\d+\.\d+)([a-zA-Z]+)(\d*)$/);
    if (match) {
        return `${match[1]}-${match[2]}${match[3]}`;
    }
    return v;
}

// Helper to normalize for PEP 440 (Python)
// Converts 1.0.0-beta.1 -> 1.0.0b1
function toPythonVer(v) {
    // Basic normalization: replace -beta. or -b with b, -alpha. with a, etc
    return v.replace(/-beta\.?(\d*)/, 'b$1')
        .replace(/-b(\d*)/, 'b$1')
        .replace(/-alpha\.?(\d*)/, 'a$1')
        .replace(/-a(\d*)/, 'a$1')
        .replace(/-rc\.?(\d*)/, 'rc$1');
}

const npmVersion = toSemVer(version);
const pyVersion = toPythonVer(version);

console.log(`NPM Version: ${npmVersion}`);
console.log(`Python Version: ${pyVersion}`);

console.log(`Updating all packages...`);

// Update core/package.json
const corePath = path.join(__dirname, '..', 'core', 'package.json');
const corePackage = JSON.parse(fs.readFileSync(corePath, 'utf8'));
corePackage.version = npmVersion; // Use SemVer

// Update generator scripts
corePackage.scripts['generate:sdk:python'] = corePackage.scripts['generate:sdk:python'].replace(
    /packageVersion=[^,]+/,
    `packageVersion=${pyVersion}` // Use Python ver
);
corePackage.scripts['generate:sdk:typescript'] = corePackage.scripts['generate:sdk:typescript'].replace(
    /npmVersion=[^,]+/,
    `npmVersion=${npmVersion}` // Use SemVer
);

fs.writeFileSync(corePath, JSON.stringify(corePackage, null, 2) + '\n');
console.log(`[OK] Updated core/package.json to ${npmVersion}`);

// Update sdks/typescript/package.json
const tsPath = path.join(__dirname, '..', 'sdks', 'typescript', 'package.json');
const tsPackage = JSON.parse(fs.readFileSync(tsPath, 'utf8'));
tsPackage.version = npmVersion; // Use SemVer
// Update pmxt-core dependency to match the new version
if (tsPackage.dependencies && tsPackage.dependencies['pmxt-core']) {
    tsPackage.dependencies['pmxt-core'] = npmVersion;
}
fs.writeFileSync(tsPath, JSON.stringify(tsPackage, null, 2) + '\n');
console.log(`[OK] Updated sdks/typescript/package.json to ${npmVersion}`);

// Update sdks/cli/package.json
const cliPath = path.join(__dirname, '..', 'sdks', 'cli', 'package.json');
if (fs.existsSync(cliPath)) {
    const cliPackage = JSON.parse(fs.readFileSync(cliPath, 'utf8'));
    cliPackage.version = npmVersion;
    if (cliPackage.dependencies && cliPackage.dependencies['pmxtjs']) {
        cliPackage.dependencies['pmxtjs'] = npmVersion;
    }
    fs.writeFileSync(cliPath, JSON.stringify(cliPackage, null, 2) + '\n');
    console.log(`[OK] Updated sdks/cli/package.json to ${npmVersion}`);
}

// Update sdks/python/pyproject.toml
const pyPath = path.join(__dirname, '..', 'sdks', 'python', 'pyproject.toml');
let pyContent = fs.readFileSync(pyPath, 'utf8');
pyContent = pyContent.replace(/^version = "[^"]*"/m, `version = "${pyVersion}"`); // Use Python ver
fs.writeFileSync(pyPath, pyContent);
console.log(`[OK] Updated sdks/python/pyproject.toml to ${pyVersion}`);

// Update sdks/python/pmxt/__init__.py
const pyInitPath = path.join(__dirname, '..', 'sdks', 'python', 'pmxt', '__init__.py');
let pyInitContent = fs.readFileSync(pyInitPath, 'utf8');
pyInitContent = pyInitContent.replace(/^__version__ = "[^"]*"/m, `__version__ = "${pyVersion}"`);
fs.writeFileSync(pyInitPath, pyInitContent);
console.log(`[OK] Updated sdks/python/pmxt/__init__.py to ${pyVersion}`);

console.log(`\n[SUCCESS] All packages updated.`);
