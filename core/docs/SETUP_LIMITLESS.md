# Limitless Setup Guide

To trade on Limitless via the API, you need your **Ethereum Private Key** from the wallet you use with Limitless Exchange.

## 1. Exporting your Private Key

This is the private key of your wallet that you use to access Limitless Exchange.

### From MetaMask:

1. **Open the Account Menu** in MetaMask.
   Click the top-left icon (or account selector) to view your accounts.

2. **Open Account Options** (...) next to the account you want to use.

3. **Select Account Details**.

4. **Reveal Private Key** and unlock your wallet.

5. **Copy the Key**.

## 2. Configuration

Add these to your `.env` file or pass them directly to the constructor:

```bash
LIMITLESS_PRIVATE_KEY=0x...
```

## 3. Initialization (Python)

```python
import os
import pmxt

exchange = pmxt.Limitless(
    private_key=os.getenv('LIMITLESS_PRIVATE_KEY')
)

# Check balance
balance = exchange.fetch_balance()
print(f"Available: {balance[0].available}")

# Place an order
order = exchange.create_order(
    market_id='market-123',
    outcome_id='outcome-456',
    side='buy',
    type='limit',
    price=0.55,
    amount=10
)
```

## 4. Initialization (TypeScript)

```typescript
import pmxt from 'pmxtjs';

const exchange = new pmxt.Limitless({
    privateKey: process.env.LIMITLESS_PRIVATE_KEY
});

// Check balance
const balances = await exchange.fetchBalance();
console.log(`Available: ${balances[0].available}`);

// Place an order
const order = await exchange.createOrder({
    marketId: 'market-123',
    outcomeId: 'outcome-456',
    side: 'buy',
    type: 'limit',
    price: 0.55,
    amount: 10
});
```

## Important Notes

- Limitless runs on **Base** mainnet (chain ID 8453), not Ethereum mainnet or Polygon, so fund this wallet with USDC on Base
- Your private key should start with `0x`
- Never share your private key or commit it to version control
- Consider using environment variables for security

## Security Best Practices

1. Store your private key in `.env` file
2. Add `.env` to your `.gitignore`
3. Use separate wallets for development and production
4. Start with small amounts when testing
