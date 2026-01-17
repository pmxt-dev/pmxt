// Update package versions from git tag
// Usage: node update-versions.js <version>

const fs = require('fs');
const path = require('path');

const version = process.argv[2];

if (!version) {
    console.error('Error: Version argument required');
    process.exit(1);
}

console.log(`Updating all packages to version ${version}...`);

// Update core/package.json
const corePath = path.join(__dirname, '..', 'core', 'package.json');
const corePackage = JSON.parse(fs.readFileSync(corePath, 'utf8'));
corePackage.version = version;

// Update generator scripts
corePackage.scripts['generate:sdk:python'] = corePackage.scripts['generate:sdk:python'].replace(
    /packageVersion=[0-9.]+/,
    `packageVersion=${version}`
);
corePackage.scripts['generate:sdk:typescript'] = corePackage.scripts['generate:sdk:typescript'].replace(
    /npmVersion=[0-9.]+/,
    `npmVersion=${version}`
);

fs.writeFileSync(corePath, JSON.stringify(corePackage, null, 2) + '\n');
console.log(`[OK] Updated core/package.json to ${version}`);

// Update sdks/typescript/package.json
const tsPath = path.join(__dirname, '..', 'sdks', 'typescript', 'package.json');
const tsPackage = JSON.parse(fs.readFileSync(tsPath, 'utf8'));
tsPackage.version = version;
fs.writeFileSync(tsPath, JSON.stringify(tsPackage, null, 2) + '\n');
console.log(`[OK] Updated sdks/typescript/package.json to ${version}`);

// Update sdks/python/pyproject.toml
const pyPath = path.join(__dirname, '..', 'sdks', 'python', 'pyproject.toml');
let pyContent = fs.readFileSync(pyPath, 'utf8');
pyContent = pyContent.replace(/^version = "[^"]*"/m, `version = "${version}"`);
fs.writeFileSync(pyPath, pyContent);
console.log(`[OK] Updated sdks/python/pyproject.toml to ${version}`);

console.log(`\n[SUCCESS] All packages updated to version ${version}`);
