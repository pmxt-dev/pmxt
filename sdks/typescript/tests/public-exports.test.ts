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

  it('exports flat environment variable constants alongside ENV', () => {
    expect(pmxt.ENV_BASE_URL).toBe(pmxt.ENV.BASE_URL);
    expect(pmxt.ENV_API_KEY).toBe(pmxt.ENV.API_KEY);
  });
});
