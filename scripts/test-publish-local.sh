#!/bin/bash

# Local test script to verify publishing workflow before pushing to GitHub
# This mirrors the .github/workflows/test-publish.yml workflow

set -e  # Exit on error

echo "[TEST] Starting local publish test..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Clean everything
echo -e "${BLUE}Step 1: Cleaning build artifacts...${NC}"
rm -rf core/dist
rm -rf sdks/typescript/dist
rm -rf sdks/cli/dist
rm -rf sdks/typescript/generated
rm -rf sdks/python/generated
rm -rf sdks/python/dist
rm -rf sdks/python/build
rm -rf sdks/python/*.egg-info
echo -e "${GREEN}[OK] Clean complete${NC}"
echo ""

# Step 2: Install dependencies
echo -e "${BLUE}Step 2: Installing dependencies...${NC}"
npm ci
echo -e "${GREEN}[OK] Dependencies installed${NC}"
echo ""

# Step 3: Generate SDKs
echo -e "${BLUE}Step 3: Generating SDKs...${NC}"
npm run generate:sdk:all --workspace=pmxt-core
echo -e "${GREEN}[OK] SDKs generated${NC}"
echo ""

# Step 4: Build all workspaces
echo -e "${BLUE}Step 4: Building all workspaces...${NC}"
npm run build --workspaces
echo -e "${GREEN}[OK] All workspaces built${NC}"
echo ""

# Step 5: Start server and run tests
echo -e "${BLUE}Step 5: Starting PMXT server...${NC}"
npm run server --workspace=pmxt-core &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server to start..."
TIMEOUT=30
ELAPSED=0
until curl -s http://localhost:3847/health > /dev/null 2>&1; do
    sleep 1
    ELAPSED=$((ELAPSED + 1))
    if [ $ELAPSED -ge $TIMEOUT ]; then
        echo -e "${RED}[FAIL] Server failed to start within ${TIMEOUT} seconds${NC}"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
done
echo -e "${GREEN}[OK] Server is ready!${NC}"
echo ""

# Step 6: Run tests
echo -e "${BLUE}Step 6: Running tests...${NC}"
npm test --workspaces || {
    echo -e "${RED}[FAIL] Tests failed${NC}"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
}
echo -e "${GREEN}[OK] All tests passed${NC}"
echo ""

# Step 7: Dry run publish
echo -e "${BLUE}Step 7: Dry run publish (pmxt-core)...${NC}"
npm publish --workspace=pmxt-core --dry-run 2>&1 | tee /tmp/pmxt-core-publish.log || {
    if grep -q "cannot publish over the previously published versions" /tmp/pmxt-core-publish.log; then
        echo -e "${GREEN}[OK] pmxt-core package is valid (version already published - expected)${NC}"
    else
        echo -e "${RED}[FAIL] Dry run publish failed for pmxt-core${NC}"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
}
echo ""

echo -e "${BLUE}Step 8: Dry run publish (pmxtjs)...${NC}"
npm publish --workspace=pmxtjs --dry-run 2>&1 | tee /tmp/pmxtjs-publish.log || {
    if grep -q "cannot publish over the previously published versions" /tmp/pmxtjs-publish.log; then
        echo -e "${GREEN}[OK] pmxtjs package is valid (version already published - expected)${NC}"
    else
        echo -e "${RED}[FAIL] Dry run publish failed for pmxtjs${NC}"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
}
echo ""

echo -e "${BLUE}Step 9: Dry run publish (@pmxt/cli)...${NC}"
npm publish --workspace=@pmxt/cli --dry-run 2>&1 | tee /tmp/pmxt-cli-publish.log || {
    if grep -q "cannot publish over the previously published versions" /tmp/pmxt-cli-publish.log; then
        echo -e "${GREEN}[OK] @pmxt/cli package is valid (version already published - expected)${NC}"
    else
        echo -e "${RED}[FAIL] Dry run publish failed for @pmxt/cli${NC}"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
}
echo ""

# Step 10: Test Python package
echo -e "${BLUE}Step 10: Testing Python package...${NC}"
cd sdks/python

# Install Python dependencies
python3 -m pip install --upgrade pip > /dev/null 2>&1
pip install build twine pytest > /dev/null 2>&1
pip install . > /dev/null 2>&1

# Run Python tests
pytest || {
    echo -e "${RED}[FAIL] Python tests failed${NC}"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
}
echo -e "${GREEN}[OK] Python tests passed${NC}"
echo ""

# Build Python package
echo -e "${BLUE}Step 11: Building Python package...${NC}"
python3 -m build || {
    echo -e "${RED}[FAIL] Python build failed${NC}"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
}
echo -e "${GREEN}[OK] Python package built${NC}"
echo ""

# Verify package metadata
echo -e "${BLUE}Step 12: Verifying Python package metadata...${NC}"
twine check dist/* || {
    echo -e "${RED}[FAIL] Python package metadata verification failed${NC}"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
}
echo -e "${GREEN}[OK] Python package metadata verified${NC}"
echo ""

cd ../..

# Cleanup
kill $SERVER_PID 2>/dev/null || true

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}[OK] All tests passed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "You can now safely push to GitHub."
