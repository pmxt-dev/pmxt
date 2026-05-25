# Scripts

This directory contains utility scripts for the PMXT project.

## Available Scripts

### `release.sh`
Release automation script that creates and pushes version tags.

**Usage:**
```bash
./scripts/release.sh <version>
```

**Example:**
```bash
./scripts/release.sh 0.5.0
```

**What it does:**
1. Validates version format
2. Creates a git tag `v<version>`
3. Pushes the tag to GitHub
4. Triggers GitHub Actions to build and publish all packages

---

### `update-versions.js`
Node.js script to update version numbers across all package files.

**Usage:**
```bash
node scripts/update-versions.js <version>
```

**What it updates:**
- `core/package.json`
- `sdks/typescript/package.json`
- `sdks/cli/package.json`
- `sdks/python/pyproject.toml`

---

### `test-publish-local.sh`
Test script for validating the publish workflow locally before pushing tags.

**Usage:**
```bash
./scripts/test-publish-local.sh
```

**What it does:**
1. Builds all packages
2. Starts the PMXT server
3. Runs all SDK tests
4. Validates everything works before release

---

### `test-version-update.sh`
Test script for validating the version update functionality.

**Usage:**
```bash
./scripts/test-version-update.sh
```

**What it does:**
1. Tests version number extraction from git tags
2. Validates that `update-versions.js` correctly updates all package files
