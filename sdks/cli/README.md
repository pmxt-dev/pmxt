# @pmxt/cli

Command-line interface for PMXT.

## Install

```bash
npm install -g @pmxt/cli
```

Or run without installing globally:

```bash
npx @pmxt/cli polymarket markets --query Trump --limit 5
```

## Usage

Use exchange-first commands for day-to-day work:

```bash
pmxt polymarket markets --query Trump --limit 5
pmxt polymarket fetchMarkets --query Trump --limit 5
pmxt polymarket orderbook <outcome-id> --limit 20
pmxt polymarket trades <outcome-id> --limit 25
```

The explicit flag form is equivalent:

```bash
pmxt markets --exchange polymarket --query Trump --limit 5
```

## Auth

```bash
pmxt auth login
pmxt auth status
pmxt polymarket auth set-exchange --private-key 0x...
pmxt polymarket auth status
```

You can also use environment variables or one-shot flags:

```bash
PMXT_API_KEY=pmxt_... pmxt markets --limit 5
pmxt markets --pmxt-api-key pmxt_... --limit 5
```
