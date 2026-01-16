#!/usr/bin/env node
/**
 * Test script for the PMXT Sidecar Server
 * 
 * This script demonstrates how to call all the pmxt methods via HTTP
 */

const BASE_URL = 'http://localhost:3847';

async function testHealthCheck() {
    console.log('\nTesting health check...');
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    console.log('Health check:', data);
}

async function testVersion() {
    console.log('\nTesting version endpoint...');
    const response = await fetch(`${BASE_URL}/version`);
    const data = await response.json();
    console.log('Version:', data);
}

async function testFetchMarkets() {
    console.log('\nTesting fetchMarkets (Polymarket)...');
    const response = await fetch(`${BASE_URL}/api/polymarket/fetchMarkets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            args: [{ limit: 5 }]
        })
    });
    const data = await response.json();

    if (data.success) {
        console.log(`Fetched ${data.data.length} markets`);
        console.log('  First market:', data.data[0]?.title);
    } else {
        console.error('Error:', data.error);
    }
}

async function testSearchMarkets() {
    console.log('\nTesting searchMarkets (Kalshi)...');
    const response = await fetch(`${BASE_URL}/api/kalshi/searchMarkets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            args: ['Fed', { limit: 3 }]
        })
    });
    const data = await response.json();

    if (data.success) {
        console.log(`Found ${data.data.length} markets`);
        data.data.forEach((market, i) => {
            console.log(`  ${i + 1}. ${market.title}`);
        });
    } else {
        console.error('Error:', data.error);
    }
}

async function testGetMarketsBySlug() {
    console.log('\nTesting getMarketsBySlug (Polymarket)...');
    const response = await fetch(`${BASE_URL}/api/polymarket/getMarketsBySlug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            args: ['who-will-trump-nominate-as-fed-chair']
        })
    });
    const data = await response.json();

    if (data.success) {
        console.log(`Found market: ${data.data[0]?.title}`);
        console.log(`  Outcomes: ${data.data[0]?.outcomes.length}`);
    } else {
        console.error('Error:', data.error);
    }
}

async function testFetchOHLCV() {
    console.log('\nTesting fetchOHLCV (Polymarket)...');

    // First, get a market to extract an outcome ID
    const marketsResponse = await fetch(`${BASE_URL}/api/polymarket/searchMarkets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            args: ['Trump', { limit: 1 }]
        })
    });
    const marketsData = await marketsResponse.json();

    if (!marketsData.success || !marketsData.data[0]) {
        console.log('  Skipping (no markets found)');
        return;
    }

    const outcomeId = marketsData.data[0].outcomes[0].id;
    console.log(`  Using outcome ID: ${outcomeId.substring(0, 20)}...`);

    const response = await fetch(`${BASE_URL}/api/polymarket/fetchOHLCV`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            args: [
                outcomeId,
                { resolution: '1d', limit: 7 }
            ]
        })
    });
    const data = await response.json();

    if (data.success) {
        console.log(`Fetched ${data.data.length} candles`);
        if (data.data[0]) {
            const candle = data.data[0];
            console.log(`  Latest: O=${candle.open} H=${candle.high} L=${candle.low} C=${candle.close}`);
        }
    } else {
        console.error('Error:', data.error);
    }
}

async function runAllTests() {
    console.log('PMXT Sidecar Server Test Suite\n');
    console.log('Testing server at:', BASE_URL);

    try {
        await testHealthCheck();
        // await testVersion(); // Endpoint removed
        await testFetchMarkets();
        await testSearchMarkets();
        await testGetMarketsBySlug();
        await testFetchOHLCV();

        console.log('\nAll tests completed!\n');
    } catch (error) {
        console.error('\nTest failed:', error.message);
        process.exit(1);
    }
}

runAllTests();
