"""Unit tests for Router.sql() and Router.fetch_order_book().

The HTTP layer is mocked at ``_api_client.call_api`` so the SDK's real
request-construction and response-parsing code paths are exercised without
touching the network.
"""

from __future__ import annotations

import ast
import inspect
import json
from typing import Any, Dict

import pmxt
from pmxt.models import SqlResult, SqlColumn, SqlMeta, OrderBook, MatchedMarketPair
from pmxt.router import Router


PMXT_API_KEY = "test_pmxt_key_xxx"
BASE_URL = "https://api.example.test"


class _FakeResponse:
    def __init__(self, payload: Dict[str, Any]) -> None:
        self.data = json.dumps(payload).encode("utf-8")

    def read(self) -> None:  # mirrors urllib3 HTTPResponse.read()
        return None


def _make_router() -> Router:
    return Router(pmxt_api_key=PMXT_API_KEY, base_url=BASE_URL, auto_start_server=False)


def _install_call_api(monkeypatch, router: Router, payload: Dict[str, Any]):
    calls = []

    def fake_call_api(method=None, url=None, body=None, header_params=None, **kwargs):
        calls.append({"method": method, "url": url, "body": body, "headers": header_params})
        return _FakeResponse(payload)

    monkeypatch.setattr(router._api_client, "call_api", fake_call_api)
    return calls


def test_sql_posts_query_and_parses_result(monkeypatch):
    router = _make_router()
    payload = {
        "data": [{"n": 1}, {"n": 2}],
        "meta": {
            "columns": [{"name": "n", "type": "UInt64"}],
            "rows": 2,
            "statistics": {"elapsed": 0.01},
        },
    }
    calls = _install_call_api(monkeypatch, router, payload)

    result = router.sql("SELECT n FROM t")

    assert len(calls) == 1
    assert calls[0]["method"] == "POST"
    assert calls[0]["url"] == f"{BASE_URL}/v0/sql"
    assert calls[0]["body"] == {"query": "SELECT n FROM t"}

    assert isinstance(result, SqlResult)
    assert result.data == [{"n": 1}, {"n": 2}]
    assert result.meta == SqlMeta(
        columns=[SqlColumn(name="n", type="UInt64")],
        rows=2,
        statistics={"elapsed": 0.01},
    )


def test_sql_defaults_missing_meta(monkeypatch):
    router = _make_router()
    _install_call_api(monkeypatch, router, {"data": []})

    result = router.sql("SELECT 1")
    assert result.data == []
    assert result.meta == SqlMeta(columns=[], rows=0, statistics={})


def test_fetch_order_book_returns_single_book(monkeypatch):
    router = _make_router()
    payload = {
        "success": True,
        "data": {
            "bids": [{"price": 0.4, "size": 100}],
            "asks": [{"price": 0.6, "size": 50}],
            "timestamp": 123,
        },
    }
    calls = _install_call_api(monkeypatch, router, payload)

    book = router.fetch_order_book("outcome-123")

    assert calls[0]["url"] == f"{BASE_URL}/api/router/fetchOrderBook"
    assert calls[0]["body"]["args"] == ["outcome-123"]
    assert isinstance(book, OrderBook)
    assert book.bids[0].price == 0.4
    assert book.asks[0].price == 0.6


def test_fetch_matched_markets_uses_typed_router_override(monkeypatch):
    router = _make_router()
    payload = {
        "success": True,
        "data": [
            {
                "marketA": {
                    "marketId": "market-a",
                    "title": "Market A",
                    "outcomes": [],
                    "volume24h": 10,
                    "liquidity": 20,
                    "url": "https://example.test/a",
                    "sourceExchange": "venue-a",
                },
                "marketB": {
                    "marketId": "market-b",
                    "title": "Market B",
                    "outcomes": [],
                    "volume24h": 30,
                    "liquidity": 40,
                    "url": "https://example.test/b",
                    "sourceExchange": "venue-b",
                },
                "priceDifference": 0.12,
                "venueA": "venue-a",
                "venueB": "venue-b",
                "priceA": 0.44,
                "priceB": 0.56,
                "relation": "identity",
                "confidence": 0.97,
                "reasoning": "same resolution condition",
            }
        ],
    }
    calls = _install_call_api(monkeypatch, router, payload)

    result = router.fetch_matched_markets(
        min_difference=0.1,
        relations=["identity"],
    )

    assert calls[0]["url"] == f"{BASE_URL}/api/router/fetchMatchedMarkets"
    assert calls[0]["body"]["args"] == [{"minDifference": 0.1, "relations": ["identity"]}]
    assert isinstance(result[0], MatchedMarketPair)
    assert result[0].market_a.market_id == "market-a"
    assert result[0].market_b.source_exchange == "venue-b"
    assert result[0].price_difference == 0.12


def test_fetch_matched_prices_is_typed_alias(monkeypatch):
    router = _make_router()
    payload = {
        "success": True,
        "data": [
            {
                "marketA": {
                    "marketId": "market-a",
                    "title": "Market A",
                    "outcomes": [],
                    "volume24h": 0,
                    "liquidity": 0,
                    "url": "https://example.test/a",
                },
                "marketB": {
                    "marketId": "market-b",
                    "title": "Market B",
                    "outcomes": [],
                    "volume24h": 0,
                    "liquidity": 0,
                    "url": "https://example.test/b",
                },
                "priceDifference": 0.05,
                "venueA": "a",
                "venueB": "b",
                "priceA": 0.45,
                "priceB": 0.5,
            }
        ],
    }
    calls = _install_call_api(monkeypatch, router, payload)

    import pytest

    with pytest.warns(DeprecationWarning):
        result = router.fetch_matched_prices(limit=2)

    assert calls[0]["url"] == f"{BASE_URL}/api/router/fetchMatchedMarkets"
    assert isinstance(result[0], MatchedMarketPair)


def test_router_class_retains_all_methods():
    """AST check: fetch_order_book/sql are real Router methods and all the
    pre-existing public methods are still defined on the class body."""
    source = inspect.getsource(Router)
    tree = ast.parse(source)
    class_def = tree.body[0]
    assert isinstance(class_def, ast.ClassDef)
    method_names = {n.name for n in class_def.body if isinstance(n, ast.FunctionDef)}

    expected = {
        "__init__",
        "fetch_market_matches",
        "fetch_matches",
        "fetch_event_matches",
        "fetch_matched_market_clusters",
        "fetch_matched_event_clusters",
        "fetch_matched_markets",
        "fetch_matched_prices",
        "compare_market_prices",
        "fetch_hedges",
        "fetch_arbitrage",
        "fetch_order_book",
        "sql",
    }
    missing = expected - method_names
    assert not missing, f"Router lost methods: {missing}"


def test_sql_types_exported_from_package_root():
    assert pmxt.SqlResult is SqlResult
    assert pmxt.SqlColumn is SqlColumn
    assert pmxt.SqlMeta is SqlMeta


def test_matched_pair_types_exported_from_package_root():
    assert pmxt.MatchedMarketPair is MatchedMarketPair
    assert pmxt.MatchedPricePair is MatchedMarketPair
