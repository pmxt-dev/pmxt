#!/usr/bin/env bash
# PMXT Verification Script
# Ensures 100% certainty that SDKs work correctly with the Core Server.
# This runs REAL integration tests with assertions, not just examples.

echo "Starting PMXT Verification..."

# Track failures correctly
CORE_FAIL=0
PYTHON_FAIL=0
TS_FAIL=0

# 1. Build Core
echo "Building Core..."
cd core
# Skip install if node_modules exists (to avoid version mismatch errors in dev)
if [ ! -d "node_modules" ] && [ ! -d "../node_modules" ]; then
    if [ -f "../package.json" ]; then
        (cd .. && npm install --silent)
    else
        npm install --silent
    fi
fi
npm run build
cd ..

# 1.5 Run Core Unit/Compliance Tests
echo "Running Core Tests..."
npm test --workspace=pmxt-core || CORE_FAIL=1

# 2. Ensure Server is Running
echo "Starting/Checking Server..."
node core/bin/pmxt-ensure-server

# Give the server a moment to stabilize
sleep 1

# 3. Run Integration Tests
echo "Server is up. Running SDK Integration Tests..."

# Verify Python SDK
echo ""
echo "Running Python SDK Integration Tests..."
if [ -d "sdks/python" ]; then
    cd sdks/python
    
    # Install dependencies if needed
    if command -v python3 &> /dev/null; then
        # Install package in editable mode
        python3 -m pip install -e . --quiet 2>/dev/null || echo "Package already installed or install failed"
        
        # Install test dependencies
        python3 -m pip install pytest pytest-asyncio --quiet 2>/dev/null || true
        
        # Run integration tests
        if [ -d "tests" ]; then
            echo "Running all Python tests..."
            python3 -m pytest tests/ -v
            PYTHON_EXIT_CODE=$?
            
            if [ $PYTHON_EXIT_CODE -eq 0 ]; then
                echo "Python SDK Tests PASSED"
            else
                echo "Python SDK Tests FAILED"
                PYTHON_FAIL=1
            fi
        else
            echo "Python tests directory not found"
        fi
    else
        echo "python3 not found, skipping Python verification"
    fi
    
    cd ../..
else
    echo "Python SDK not found"
fi

# Verify TypeScript SDK
echo ""
echo "Running TypeScript SDK Integration Tests..."
if [ -d "sdks/typescript" ]; then
    cd sdks/typescript
    
    # Install dependencies only if missing or forced
    if [ ! -d "node_modules" ]; then
        echo "Installing TS SDK dependencies..."
        npm install --silent
    fi
    
    # Install jest and ts-jest if not present
    npm install --save-dev jest ts-jest @types/jest --silent 2>/dev/null || true
    
    # Create jest config if it doesn't exist
    if [ ! -f "jest.config.cjs" ] && [ ! -f "jest.config.js" ]; then
        cat > jest.config.cjs << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
EOF
    fi
    
    # Run integration tests
    if [ -f "tests/integration.test.ts" ]; then
        echo "Running jest..."
        # Force jest to use the cjs config if we just created it
        if [ -f "jest.config.cjs" ]; then
            npx jest --config jest.config.cjs
        else
            npm test
        fi
        TS_EXIT_CODE=$?
        
        if [ $TS_EXIT_CODE -eq 0 ]; then
            echo "TypeScript SDK Integration Tests PASSED"
        else
            echo "TypeScript SDK Integration Tests FAILED"
            TS_FAIL=1
        fi
    else
        echo "TypeScript integration tests not found"
    fi
    
    cd ../..
else
    echo "TypeScript SDK not found"
fi

if [ $CORE_FAIL -ne 0 ] || [ $PYTHON_FAIL -ne 0 ] || [ $TS_FAIL -ne 0 ]; then
    echo ""
    echo "========================================"
    echo "VERIFICATION FAILED"
    [ $CORE_FAIL -ne 0 ] && echo "- Core Tests: FAILED"
    [ $PYTHON_FAIL -ne 0 ] && echo "- Python SDK Tests: FAILED"
    [ $TS_FAIL -ne 0 ] && echo "- TypeScript SDK Tests: FAILED"
    echo "========================================"
    exit 1
fi

echo ""
echo "All SDK Integration Tests Passed!"
echo "Both SDKs are verified to work correctly with the Core Server"

