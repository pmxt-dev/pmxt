import { ExchangeCredentials } from "../BaseExchange";
import { PolymarketExchange } from "../exchanges/polymarket";
import { LimitlessExchange } from "../exchanges/limitless";
import { KalshiExchange } from "../exchanges/kalshi";
import { KalshiDemoExchange } from "../exchanges/kalshi-demo";
import { ProbableExchange } from "../exchanges/probable";
import { BaoziExchange } from "../exchanges/baozi";
import { MyriadExchange } from "../exchanges/myriad";
import { OpinionExchange } from "../exchanges/opinion";
import { MetaculusExchange } from "../exchanges/metaculus";
import { SmarketsExchange } from "../exchanges/smarkets";
import { PolymarketUSExchange } from "../exchanges/polymarket_us";
import { HyperliquidExchange } from "../exchanges/hyperliquid";
import { GeminiTitanExchange } from "../exchanges/gemini-titan";
import { SuiBetsExchange } from "../exchanges/suibets";
import { RainExchange } from "../exchanges/rain";
import { HunchExchange } from "../exchanges/hunch";
import { MockExchange } from "../exchanges/mock";
import { Router } from "../router";

export function createExchange(
  name: string,
  credentials?: ExchangeCredentials,
  bearerToken?: string,
): unknown {
  switch (name) {
    case "polymarket":
      return new PolymarketExchange({
        privateKey:
          credentials?.privateKey ||
          process.env.POLYMARKET_PK ||
          process.env.POLYMARKET_PRIVATE_KEY,
        apiKey: credentials?.apiKey || process.env.POLYMARKET_API_KEY,
        apiSecret: credentials?.apiSecret || process.env.POLYMARKET_API_SECRET,
        passphrase:
          credentials?.passphrase || process.env.POLYMARKET_PASSPHRASE,
        funderAddress:
          credentials?.funderAddress ||
          process.env.POLYMARKET_FUNDER_ADDRESS ||
          process.env.POLYMARKET_PROXY_ADDRESS,
        signatureType:
          credentials?.signatureType ||
          process.env.POLYMARKET_SIGNATURE_TYPE,
      });
    case "limitless":
      return new LimitlessExchange({
        privateKey:
          credentials?.privateKey ||
          process.env.LIMITLESS_PK ||
          process.env.LIMITLESS_PRIVATE_KEY,
        apiKey: credentials?.apiKey || process.env.LIMITLESS_API_KEY,
        apiSecret: credentials?.apiSecret || process.env.LIMITLESS_API_SECRET,
        passphrase:
          credentials?.passphrase || process.env.LIMITLESS_PASSPHRASE,
      });
    case "kalshi":
      return new KalshiExchange({
        credentials: {
          apiKey: credentials?.apiKey || process.env.KALSHI_API_KEY,
          privateKey:
            credentials?.privateKey || process.env.KALSHI_PRIVATE_KEY,
        },
      });
    case "kalshi-demo":
      return new KalshiDemoExchange({
        credentials: {
          apiKey: credentials?.apiKey || process.env.KALSHI_API_KEY,
          privateKey:
            credentials?.privateKey || process.env.KALSHI_PRIVATE_KEY,
        },
      });
    case "probable":
      return new ProbableExchange({
        apiKey: credentials?.apiKey || process.env.PROBABLE_API_KEY,
        apiSecret: credentials?.apiSecret || process.env.PROBABLE_API_SECRET,
        passphrase:
          credentials?.passphrase || process.env.PROBABLE_PASSPHRASE,
        privateKey:
          credentials?.privateKey || process.env.PROBABLE_PRIVATE_KEY,
      });
    case "baozi":
      return new BaoziExchange({
        privateKey:
          credentials?.privateKey || process.env.BAOZI_PRIVATE_KEY,
      });
    case "myriad":
      return new MyriadExchange({
        apiKey:
          credentials?.apiKey ||
          process.env.MYRIAD_API_KEY ||
          process.env.MYRIAD_PROD,
        privateKey:
          credentials?.privateKey || process.env.MYRIAD_WALLET_ADDRESS,
      });
    case "opinion":
      return new OpinionExchange({
        apiKey: credentials?.apiKey || process.env.OPINION_API_KEY,
        privateKey:
          credentials?.privateKey || process.env.OPINION_PRIVATE_KEY,
        funderAddress: credentials?.funderAddress,
      });
    case "metaculus":
      return new MetaculusExchange({
        apiToken:
          credentials?.apiToken || process.env.METACULUS_API_TOKEN,
      });
    case "smarkets":
      return new SmarketsExchange({
        apiKey: credentials?.apiKey || process.env.SMARKETS_EMAIL,
        privateKey:
          credentials?.privateKey || process.env.SMARKETS_PASSWORD,
      });
    case "polymarket_us":
      return new PolymarketUSExchange({
        apiKey: credentials?.apiKey || process.env.POLYMARKET_US_KEY_ID,
        privateKey:
          credentials?.privateKey || process.env.POLYMARKET_US_SECRET_KEY,
      });
    case "hyperliquid":
      return new HyperliquidExchange({
        apiKey:
          credentials?.apiKey || process.env.HYPERLIQUID_WALLET_ADDRESS,
        privateKey:
          credentials?.privateKey || process.env.HYPERLIQUID_PRIVATE_KEY,
      });
    case "gemini-titan":
      return new GeminiTitanExchange({
        apiKey:
          credentials?.apiKey || process.env.GEMINI_API_KEY,
        apiSecret:
          credentials?.apiSecret || process.env.GEMINI_API_SECRET,
      });
    case "suibets":
      return new SuiBetsExchange({
        walletAddress:
          (credentials as { walletAddress?: string })?.walletAddress || process.env.SUIBETS_WALLET_ADDRESS,
        baseUrl:
          credentials?.baseUrl || process.env.SUIBETS_BASE_URL,
      });
    case "rain":
      return new RainExchange({
        privateKey:
          credentials?.privateKey || process.env.RAIN_PRIVATE_KEY,
        walletAddress:
          (credentials as { walletAddress?: string })?.walletAddress ||
          process.env.RAIN_WALLET_ADDRESS,
        subgraphUrl:
          (credentials as { subgraphUrl?: string })?.subgraphUrl ||
          process.env.RAIN_SUBGRAPH_URL,
        subgraphApiKey:
          (credentials as { subgraphApiKey?: string })?.subgraphApiKey ||
          process.env.RAIN_SUBGRAPH_API_KEY,
        wsRpcUrl:
          (credentials as { wsRpcUrl?: string })?.wsRpcUrl ||
          process.env.RAIN_WS_RPC_URL,
        environment:
          ((credentials as { environment?: string })?.environment ||
            process.env.RAIN_ENVIRONMENT) as
            | "development"
            | "stage"
            | "production"
            | undefined,
      });
    case "hunch":
      return new HunchExchange({
        privateKey: credentials?.privateKey || process.env.HUNCH_PRIVATE_KEY,
        walletAddress:
          (credentials as { walletAddress?: string })?.walletAddress ||
          process.env.HUNCH_WALLET_ADDRESS,
        baseUrl: credentials?.baseUrl || process.env.HUNCH_BASE_URL,
      });
    case "mock":
      return new MockExchange();
    case "router":
      return new Router({
        apiKey: bearerToken!,
      });
    default:
      throw new Error(`Unknown exchange: ${name}`);
  }
}
