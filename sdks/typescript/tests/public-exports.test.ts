import * as pmxt from '../index';
import { FeedClient as DirectFeedClient } from '../pmxt/feed-client';
import type { ClusterSortOption, MatchedClusterSort } from '../index';

const acceptsClusterSortOption = (sort: ClusterSortOption): MatchedClusterSort => sort;

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

  it('exports ClusterSortOption as a public type alias matching MatchedClusterSort', () => {
    const byVolume = acceptsClusterSortOption('volume');
    const byConfidence = acceptsClusterSortOption('confidence');
    expect([byVolume, byConfidence]).toEqual(['volume', 'confidence']);
  });
});
