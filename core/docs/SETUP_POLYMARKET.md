# Polymarket Setup Guide

To trade on Polymarket via the API, you need your **Polygon Private Key**. If you are using a Polymarket Smart Wallet (Proxy), you will also need your **Proxy Address**.

## 1. Exporting your Private Key (EOA)

This is the private key of your "Signer" wallet (the one you use to log in to Polymarket).

1. **Open the Account Menu** in MetaMask.  
   Click the top-left icon (or account selector) to view your accounts.  
   ![Select Account](images/0.png)

2. **Open Account Options** (...) next to the account you want to use.  
   ![Account Options](images/1.png)

3. **Select Account Details**.  
   ![Account Details](images/2.png)

4. **Reveal Private Key** and unlock your wallet.  
   ![Reveal Key](images/3.png)

5. **Copy the Key**.  
   ![Copy Key](images/4.png)

## 2. Finding your Proxy Address (Optional but Recommended)

Most modern Polymarket accounts use a "Smart Wallet" or Proxy to hold funds. While `pmxt` attempts to auto-discover this address, it is more reliable to provide it manually.

1. Go to [Polymarket.com](https://polymarket.com).
2. Hover over your profile in the top right.
3. Your **Proxy Address** is the address shown. It is the address starting with `0x`.

## 3. Configuration

Add these to your `.env` file or pass them directly to the constructor. `pmxt` supports both numeric IDs and human-readable names:

```bash
POLYMARKET_PRIVATE_KEY=0x...
POLYMARKET_PROXY_ADDRESS=0x...

# Choose your account type:
# - 'deposit_wallet' (Newest accounts, post-2024 — recommended)
# - 'gnosis_safe'    (2023-era accounts)
# - 'polyproxy'      (Legacy proxy accounts)
# - 'eoa'            (Standard wallet, no proxy)
#
# If balance shows $0 or orders fail with "maker address not allowed",
# try a different signature type.
POLYMARKET_SIGNATURE_TYPE='deposit_wallet'
```

## 4. Initialization (Python)

```python
import os
import pmxt

exchange = pmxt.Polymarket(
    private_key=os.getenv('POLYMARKET_PRIVATE_KEY'),
    proxy_address=os.getenv('POLYMARKET_PROXY_ADDRESS'),
    signature_type='deposit_wallet'
)
```

## 5. Initialization (TypeScript)

```typescript
import { Polymarket } from 'pmxtjs';

const exchange = new Polymarket({
    privateKey: process.env.POLYMARKET_PRIVATE_KEY,
    proxyAddress: process.env.POLYMARKET_PROXY_ADDRESS,
    signatureType: 'gnosis-safe'
});
```
