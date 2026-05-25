#!/bin/bash

# Release script for PMXT
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 0.5.0

set -e

if [ -z "$1" ]; then
    echo "[ERROR] Error: Version number required"
    echo "Usage: ./scripts/release.sh <version>"
    echo "Example: ./scripts/release.sh 0.5.0"
    exit 1
fi

VERSION=$1

# Validate version format (basic semver check)
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "[ERROR] Error: Invalid version format. Use semantic versioning (e.g., 0.5.0)"
    exit 1
fi

echo "[RELEASE] Preparing release v$VERSION"
echo ""

# Check if we're on the right branch
CURRENT_BRANCH=$(git branch --show-current)
echo "[INFO] Current branch: $CURRENT_BRANCH"

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "[WARNING] Warning: You have uncommitted changes"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if tag already exists
if git rev-parse "v$VERSION" >/dev/null 2>&1; then
    echo "[ERROR] Error: Tag v$VERSION already exists"
    exit 1
fi

echo ""
echo "[INFO] This will:"
echo "   1. Create and push tag v$VERSION"
echo "   2. Trigger GitHub Actions to:"
echo "      - Auto-update all package versions to $VERSION"
echo "      - Build and test all packages"
echo "      - Publish pmxt-core@$VERSION to npm"
echo "      - Publish pmxtjs@$VERSION to npm"
echo "      - Publish @pmxt/cli@$VERSION to npm"
echo "      - Publish pmxt@$VERSION to PyPI"
echo ""

read -p "Proceed with release? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "[CANCEL] Release cancelled"
    exit 1
fi

echo ""
echo "[TAG] Creating tag v$VERSION..."
git tag -a "v$VERSION" -m "Release v$VERSION"

echo "[PUSH] Pushing tag to GitHub..."
git push origin "v$VERSION"

echo ""
echo "[SUCCESS] Tag v$VERSION pushed successfully!"
echo ""
echo "[LINK] Monitor the release at:"
echo "   https://github.com/pmxt-dev/pmxt/actions"
echo ""
echo "[INFO] Once published, packages will be available at:"
echo "   - npm: https://www.npmjs.com/package/pmxt-core"
echo "   - npm: https://www.npmjs.com/package/pmxtjs"
echo "   - npm: https://www.npmjs.com/package/@pmxt/cli"
echo "   - PyPI: https://pypi.org/project/pmxt/"
