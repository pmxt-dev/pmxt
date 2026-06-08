"""
Router — cross-venue intelligence layer.

Search, match, compare prices, find hedges, and detect arbitrage across
every venue PMXT supports. Only requires a PMXT API key.
"""

import json
import warnings
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Union

from .client import Exchange, _convert_market, _convert_event
from .models import (
    MatchResult,
    EventMatchResult,
    MatchedEventCluster,
    MatchedMarketCluster,
    PriceComparison,
    ArbitrageOpportunity,
    MatchRelation,
    UnifiedMarket,
    UnifiedEvent,
)
from pmxt_internal.exceptions import ApiException


def _parse_market(raw: Any) -> Any:
    """Best-effort parse of a raw market dict into UnifiedMarket."""
    if isinstance(raw, UnifiedMarket):
        return raw
    if isinstance(raw, dict):
        return _convert_market(raw)
    return raw


def _parse_event(raw: Any) -> Any:
    """Best-effort parse of a raw event dict into UnifiedEvent."""
    if isinstance(raw, UnifiedEvent):
        return raw
    if isinstance(raw, dict):
        return _convert_event(raw)
    return raw


def _parse_match_result(raw: Dict[str, Any]) -> MatchResult:
    """Parse a raw match dict into a MatchResult."""
    market_data = raw.get("market", {})
    source_raw = raw.get("sourceMarket")
    return MatchResult(
        market=_parse_market(market_data),
        relation=raw.get("relation", "identity"),
        confidence=raw.get("confidence", 0.0),
        reasoning=raw.get("reasoning"),
        best_bid=raw.get("bestBid") or market_data.get("bestBid"),
        best_ask=raw.get("bestAsk") or market_data.get("bestAsk"),
        source_market=_parse_market(source_raw) if source_raw else None,
    )


def _normalize_query_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _add_query_param(params: Dict[str, Any], key: str, value: Any) -> None:
    if value is not None and value != "":
        params[key] = _normalize_query_value(value)


def _extract_response_list(raw: Any) -> List[Dict[str, Any]]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict) and isinstance(raw.get("data"), list):
        return raw["data"]
    return []


def _parse_market_cluster(raw: Dict[str, Any]) -> MatchedMarketCluster:
    return MatchedMarketCluster(
        cluster_id=raw.get("clusterId") or raw.get("cluster_id", ""),
        canonical_title=raw.get("canonicalTitle") or raw.get("canonical_title"),
        markets=[_parse_market(m) for m in raw.get("markets", [])],
        relations=raw.get("relations", []),
        confidence=raw.get("confidence", 0.0),
        category=raw.get("category"),
        volume_24h=raw.get("volume24h", raw.get("volume_24h")),
        raw_matches=raw.get("rawMatches", raw.get("raw_matches")),
    )


def _parse_event_cluster(raw: Dict[str, Any]) -> MatchedEventCluster:
    return MatchedEventCluster(
        cluster_id=raw.get("clusterId") or raw.get("cluster_id", ""),
        canonical_title=raw.get("canonicalTitle") or raw.get("canonical_title"),
        events=[_parse_event(e) for e in raw.get("events", [])],
        relations=raw.get("relations", []),
        confidence=raw.get("confidence", 0.0),
        category=raw.get("category"),
        volume_24h=raw.get("volume24h", raw.get("volume_24h")),
        raw_matches=raw.get("rawMatches", raw.get("raw_matches")),
    )


class Router(Exchange):
    """Cross-venue intelligence layer.

    Search markets and events across every venue, find semantically
    equivalent markets on other platforms, compare prices, discover
    hedges, and scan for arbitrage — all from a single PMXT API key.

    Example::

        import pmxt

        router = pmxt.Router(pmxt_api_key="pmxt_live_...")
        markets = router.fetch_markets(query="election")
        matches = router.fetch_market_matches(markets[0])
    """

    def __init__(
        self,
        pmxt_api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        auto_start_server: bool = False,
    ) -> None:
        """
        Initialize the Router.

        Args:
            pmxt_api_key: PMXT API key (required for hosted mode).
            base_url: Override the base URL (defaults to hosted API).
            auto_start_server: Start local sidecar (default: False).
        """
        super().__init__(
            exchange_name="router",
            pmxt_api_key=pmxt_api_key,
            base_url=base_url,
            auto_start_server=auto_start_server,
        )

    # ------------------------------------------------------------------
    # Matching
    # ------------------------------------------------------------------

    def fetch_market_matches(
        self,
        market: Optional[UnifiedMarket] = None,
        *,
        market_id: Optional[str] = None,
        slug: Optional[str] = None,
        url: Optional[str] = None,
        query: Optional[str] = None,
        category: Optional[str] = None,
        relation: Optional[MatchRelation] = None,
        min_confidence: Optional[float] = None,
        limit: Optional[int] = None,
        include_prices: bool = False,
    ) -> List[MatchResult]:
        """Find markets on other venues that correspond to a given market.

        Args:
            market: A UnifiedMarket object (extracts market_id automatically).
            market_id: PMXT market ID.
            slug: Market slug (alternative to market_id).
            url: Market URL on the source venue (alternative to market_id).
            relation: Filter to a specific relation type.
            min_confidence: Minimum confidence threshold (0–1).
            limit: Maximum number of matches to return.
            include_prices: Attach live bestBid/bestAsk to each match.

        Returns:
            List of MatchResult with relation, confidence, and reasoning.
        """
        if market is not None and market_id is None:
            if hasattr(market, "slug") and market.slug:
                slug = slug or market.slug
            else:
                market_id = market.market_id
        params: Dict[str, Any] = {}
        if market_id is not None:
            params["marketId"] = market_id
        if slug is not None:
            params["slug"] = slug
        if url is not None:
            params["url"] = url
        if query is not None:
            params["query"] = query
        if category is not None:
            params["category"] = category
        if relation is not None:
            params["relation"] = relation
        if min_confidence is not None:
            params["minConfidence"] = min_confidence
        if limit is not None:
            params["limit"] = limit
        if include_prices:
            params["includePrices"] = True

        raw = self._call_method("fetchMatches", params)
        if not raw:
            return []
        return [_parse_match_result(m) for m in raw]

    def fetch_matches(
        self,
        market: Optional[UnifiedMarket] = None,
        *,
        market_id: Optional[str] = None,
        slug: Optional[str] = None,
        url: Optional[str] = None,
        query: Optional[str] = None,
        category: Optional[str] = None,
        relation: Optional[MatchRelation] = None,
        min_confidence: Optional[float] = None,
        limit: Optional[int] = None,
        include_prices: bool = False,
    ) -> List[MatchResult]:
        """Deprecated: use :meth:`fetch_market_matches` instead."""
        warnings.warn(
            "fetch_matches is deprecated, use fetch_market_matches instead",
            DeprecationWarning,
            stacklevel=2,
        )
        return self.fetch_market_matches(
            market=market,
            market_id=market_id,
            slug=slug,
            url=url,
            query=query,
            category=category,
            relation=relation,
            min_confidence=min_confidence,
            limit=limit,
            include_prices=include_prices,
        )

    def fetch_event_matches(
        self,
        event: Optional[UnifiedEvent] = None,
        *,
        event_id: Optional[str] = None,
        slug: Optional[str] = None,
        url: Optional[str] = None,
        query: Optional[str] = None,
        category: Optional[str] = None,
        relation: Optional[MatchRelation] = None,
        min_confidence: Optional[float] = None,
        limit: Optional[int] = None,
        include_prices: bool = False,
    ) -> List[EventMatchResult]:
        """Match an entire event across venues.

        Returns every matching event and its constituent market matches
        in a single call.

        Args:
            event: A UnifiedEvent object (extracts event_id automatically).
            event_id: PMXT event ID.
            slug: Event slug (alternative to event_id).
            relation: Filter market matches to a specific relation type.
            min_confidence: Minimum confidence threshold (0–1).
            limit: Maximum number of event matches to return.
            include_prices: Attach live prices to each market match.

        Returns:
            List of EventMatchResult with nested market matches.
        """
        if event is not None and event_id is None:
            if hasattr(event, "slug") and event.slug:
                slug = slug or event.slug
            else:
                event_id = event.id
        params: Dict[str, Any] = {}
        if event_id is not None:
            params["eventId"] = event_id
        if slug is not None:
            params["slug"] = slug
        if url is not None:
            params["url"] = url
        if query is not None:
            params["query"] = query
        if category is not None:
            params["category"] = category
        if relation is not None:
            params["relation"] = relation
        if min_confidence is not None:
            params["minConfidence"] = min_confidence
        if limit is not None:
            params["limit"] = limit
        if include_prices:
            params["includePrices"] = True

        raw = self._call_method("fetchEventMatches", params)
        if not raw:
            return []

        results = []
        for entry in raw:
            event = _parse_event(entry.get("event", {}))
            market_matches = [
                _parse_match_result(mm)
                for mm in entry.get("marketMatches", [])
            ]
            results.append(EventMatchResult(event=event, market_matches=market_matches))
        return results

    def _get_catalog_path(self, path: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """GET a hosted catalog /v0 path and return its raw JSON body."""
        qs = self._build_sidecar_query_string(params)
        url = f"{self._resolve_sidecar_host()}{path}{'?' + qs if qs else ''}"
        headers = {"Accept": "application/json"}
        headers.update(self._get_auth_headers())
        try:
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(
                    method="GET",
                    url=url,
                    header_params=headers,
                )
            )
            response.read()
            return json.loads(response.data)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_matched_market_clusters(
        self,
        market: Optional[UnifiedMarket] = None,
        *,
        market_id: Optional[str] = None,
        slug: Optional[str] = None,
        url: Optional[str] = None,
        query: Optional[str] = None,
        category: Optional[str] = None,
        relations: Optional[Union[str, List[MatchRelation]]] = None,
        relation: Optional[MatchRelation] = None,
        min_confidence: Optional[float] = None,
        venues: Optional[Union[str, List[str]]] = None,
        exclude_venues: Optional[Union[str, List[str]]] = None,
        min_venues: Optional[int] = None,
        with_orderbook: bool = False,
        updated_since: Optional[Any] = None,
        include_raw_matches: bool = False,
        sort: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        edge_limit: Optional[int] = None,
    ) -> List[MatchedMarketCluster]:
        """Fetch connected clusters of semantically matched markets."""
        if market is not None and market_id is None:
            if hasattr(market, "slug") and market.slug:
                slug = slug or market.slug
            else:
                market_id = market.market_id

        params: Dict[str, Any] = {}
        _add_query_param(params, "marketId", market_id)
        _add_query_param(params, "slug", slug)
        _add_query_param(params, "url", url)
        _add_query_param(params, "query", query)
        _add_query_param(params, "category", category)
        _add_query_param(params, "relations", relations)
        _add_query_param(params, "relation", relation)
        _add_query_param(params, "minConfidence", min_confidence)
        _add_query_param(params, "venues", venues)
        _add_query_param(params, "excludeVenues", exclude_venues)
        _add_query_param(params, "minVenues", min_venues)
        if with_orderbook:
            params["withOrderbook"] = True
        _add_query_param(params, "updatedSince", updated_since)
        if include_raw_matches:
            params["includeRawMatches"] = True
        _add_query_param(params, "sort", sort)
        _add_query_param(params, "limit", limit)
        _add_query_param(params, "offset", offset)
        _add_query_param(params, "edgeLimit", edge_limit)

        raw = self._get_catalog_path("/v0/matched-market-clusters", params)
        return [_parse_market_cluster(c) for c in _extract_response_list(raw)]

    def fetch_matched_event_clusters(
        self,
        event: Optional[UnifiedEvent] = None,
        *,
        event_id: Optional[str] = None,
        slug: Optional[str] = None,
        url: Optional[str] = None,
        query: Optional[str] = None,
        category: Optional[str] = None,
        relations: Optional[Union[str, List[MatchRelation]]] = None,
        relation: Optional[MatchRelation] = None,
        min_confidence: Optional[float] = None,
        venues: Optional[Union[str, List[str]]] = None,
        exclude_venues: Optional[Union[str, List[str]]] = None,
        min_venues: Optional[int] = None,
        with_orderbook: bool = False,
        updated_since: Optional[Any] = None,
        include_raw_matches: bool = False,
        sort: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        edge_limit: Optional[int] = None,
    ) -> List[MatchedEventCluster]:
        """Fetch connected clusters of semantically matched events."""
        if event is not None and event_id is None:
            if hasattr(event, "slug") and event.slug:
                slug = slug or event.slug
            else:
                event_id = event.id

        params: Dict[str, Any] = {}
        _add_query_param(params, "eventId", event_id)
        _add_query_param(params, "slug", slug)
        _add_query_param(params, "url", url)
        _add_query_param(params, "query", query)
        _add_query_param(params, "category", category)
        _add_query_param(params, "relations", relations)
        _add_query_param(params, "relation", relation)
        _add_query_param(params, "minConfidence", min_confidence)
        _add_query_param(params, "venues", venues)
        _add_query_param(params, "excludeVenues", exclude_venues)
        _add_query_param(params, "minVenues", min_venues)
        if with_orderbook:
            params["withOrderbook"] = True
        _add_query_param(params, "updatedSince", updated_since)
        if include_raw_matches:
            params["includeRawMatches"] = True
        _add_query_param(params, "sort", sort)
        _add_query_param(params, "limit", limit)
        _add_query_param(params, "offset", offset)
        _add_query_param(params, "edgeLimit", edge_limit)

        raw = self._get_catalog_path("/v0/matched-event-clusters", params)
        return [_parse_event_cluster(c) for c in _extract_response_list(raw)]

    # ------------------------------------------------------------------
    # Price comparison
    # ------------------------------------------------------------------

    def compare_market_prices(
        self,
        market: Optional[UnifiedMarket] = None,
        *,
        market_id: Optional[str] = None,
        slug: Optional[str] = None,
        url: Optional[str] = None,
    ) -> List[PriceComparison]:
        """Compare prices for the same market across venues.

        Finds identity matches and returns side-by-side bid/ask for each
        venue.

        Args:
            market: A UnifiedMarket object (extracts market_id automatically).
            market_id: PMXT market ID.
            slug: Market slug (alternative to market_id).
            url: Market URL (alternative to market_id).

        Returns:
            List of PriceComparison with venue, bestBid, bestAsk.
        """
        if market is not None and market_id is None:
            if hasattr(market, "slug") and market.slug:
                slug = slug or market.slug
            else:
                market_id = market.market_id
        params: Dict[str, Any] = {}
        if market_id is not None:
            params["marketId"] = market_id
        if slug is not None:
            params["slug"] = slug
        if url is not None:
            params["url"] = url

        raw = self._call_method("compareMarketPrices", params)
        if not raw:
            return []

        return [
            PriceComparison(
                market=_parse_market(r.get("market", {})),
                relation=r.get("relation", "identity"),
                confidence=r.get("confidence", 0.0),
                reasoning=r.get("reasoning"),
                best_bid=r.get("bestBid"),
                best_ask=r.get("bestAsk"),
                venue=r.get("venue", ""),
            )
            for r in raw
        ]

    # ------------------------------------------------------------------
    # Hedging
    # ------------------------------------------------------------------

    def fetch_hedges(
        self,
        market: Optional[UnifiedMarket] = None,
        *,
        market_id: Optional[str] = None,
        slug: Optional[str] = None,
        url: Optional[str] = None,
    ) -> List[PriceComparison]:
        """Find markets that partially hedge a position.

        Returns subset and superset matches — markets whose resolution
        condition is narrower or broader than the target.

        Args:
            market: A UnifiedMarket object (extracts market_id automatically).
            market_id: PMXT market ID.
            slug: Market slug (alternative to market_id).
            url: Market URL (alternative to market_id).

        Returns:
            List of PriceComparison with subset/superset relations.
        """
        if market is not None and market_id is None:
            if hasattr(market, "slug") and market.slug:
                slug = slug or market.slug
            else:
                market_id = market.market_id
        params: Dict[str, Any] = {}
        if market_id is not None:
            params["marketId"] = market_id
        if slug is not None:
            params["slug"] = slug
        if url is not None:
            params["url"] = url

        raw = self._call_method("fetchHedges", params)
        if not raw:
            return []

        return [
            PriceComparison(
                market=_parse_market(r.get("market", {})),
                relation=r.get("relation", "identity"),
                confidence=r.get("confidence", 0.0),
                reasoning=r.get("reasoning"),
                best_bid=r.get("bestBid"),
                best_ask=r.get("bestAsk"),
                venue=r.get("venue", ""),
            )
            for r in raw
        ]

    # ------------------------------------------------------------------
    # Arbitrage
    # ------------------------------------------------------------------

    def fetch_arbitrage(
        self,
        *,
        min_spread: Optional[float] = None,
        category: Optional[str] = None,
        limit: Optional[int] = None,
        relations: Optional[List[MatchRelation]] = None,
    ) -> List[ArbitrageOpportunity]:
        """Scan for cross-venue arbitrage opportunities.

        Finds matched markets with divergent pricing, sorted by spread
        descending.

        Args:
            min_spread: Only return pairs with spread >= this value.
            category: Filter source markets by category.
            limit: Max source markets to scan (default: 50).
            relations: Relation types to include (default: ['identity']).

        Returns:
            List of ArbitrageOpportunity sorted by spread.
        """
        params: Dict[str, Any] = {}
        if min_spread is not None:
            params["minSpread"] = min_spread
        if category is not None:
            params["category"] = category
        if limit is not None:
            params["limit"] = limit
        if relations is not None and len(relations) > 0:
            params["relations"] = ",".join(relations)

        raw = self._call_method("fetchArbitrage", params)
        if not raw:
            return []

        return [
            ArbitrageOpportunity(
                market_a=_parse_market(r.get("marketA", {})),
                market_b=_parse_market(r.get("marketB", {})),
                spread=r.get("spread", 0.0),
                buy_venue=r.get("buyVenue", ""),
                sell_venue=r.get("sellVenue", ""),
                buy_price=r.get("buyPrice", 0.0),
                sell_price=r.get("sellPrice", 0.0),
                relation=r.get("relation"),
                confidence=r.get("confidence"),
            )
            for r in raw
        ]
