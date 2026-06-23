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

  it('exports Polymarket_us as the PolymarketUS alias', () => {
    expect(pmxt.Polymarket_us).toBe(pmxt.PolymarketUS);
    expect(pmxt.default.Polymarket_us).toBe(pmxt.PolymarketUS);
  });

  it('exports Hunch as a top-level exchange client', () => {
    expect(pmxt.Hunch).toBeDefined();
    expect(pmxt.default.Hunch).toBe(pmxt.Hunch);
  });

  it('passes Hunch walletAddress through credentials', () => {
    const hunch = new pmxt.Hunch({
      autoStartServer: false,
      walletAddress: '0x0000000000000000000000000000000000000001',
    });
    expect((hunch as any).getCredentials()).toMatchObject({
      walletAddress: '0x0000000000000000000000000000000000000001',
    });
  });
});
