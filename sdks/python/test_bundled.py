#!/usr/bin/env python3
"""Test that the bundled server can start."""

import pmxt

print("Testing bundled server startup...")
try:
    poly = pmxt.Polymarket()
    print("✓ Server started successfully!")
    print("✓ Polymarket client initialized!")
    
    # Try a simple search
    markets = poly.search_markets("Trump", pmxt.MarketFilterParams(limit=1))
    if markets:
        print(f"✓ Search works! Found: {markets[0].title}")
    else:
        print("✓ Search executed (no results)")
        
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
