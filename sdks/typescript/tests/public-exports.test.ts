import * as pmxt from '../index';
import { FeedClient as DirectFeedClient } from '../pmxt/feed-client';

describe('public exports', () => {
  it('exports FeedClient as a top-level named export', () => {
    expect(pmxt.FeedClient).toBeDefined();
    expect(pmxt.FeedClient).toBe(DirectFeedClient);
  });

  it('exposes FeedClient on the default pmxt object', () => {
    expect(pmxt.default.FeedClient).toBeDefined();
    expect(pmxt.default.FeedClient).toBe(DirectFeedClient);
  });

  it('FeedClient is constructable from the top-level export', () => {
    const client = new pmxt.FeedClient('chainlink');
    expect(client).toBeInstanceOf(DirectFeedClient);
  });

  it('exports Polymarket_us as an alias of PolymarketUS', () => {
    expect(pmxt.Polymarket_us).toBe(pmxt.PolymarketUS);
    expect(pmxt.default.Polymarket_us).toBe(pmxt.PolymarketUS);
  });

  it('constructs Polymarket_us with the canonical exchange name', () => {
    const exchange = new pmxt.Polymarket_us({ autoStartServer: false });
    expect(exchange).toBeInstanceOf(pmxt.PolymarketUS);
    expect(exchange.exchangeName).toBe('polymarket_us');
  });
});
