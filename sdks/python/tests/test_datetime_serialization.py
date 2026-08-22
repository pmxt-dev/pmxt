"""Unit tests for datetime parameter serialization shared by client and router.

The Python SDK must send the same wire values as the TypeScript SDK's
``Date.toISOString()`` for the same wall-clock input (#2095, #2096): naive
datetimes are treated as UTC, aware datetimes are converted to UTC, and the
result always carries millisecond precision with a ``Z`` suffix.

The transport layer is mocked so no server or network access happens.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict
from urllib.parse import parse_qs, urlparse

from pmxt._exchanges import Mock
from pmxt.router import Router


PMXT_API_KEY = "test_pmxt_key_xxx"
BASE_URL = "https://api.example.test"


class _FakeResponse:
    def __init__(self, payload: Dict[str, Any]) -> None:
        self.data = json.dumps(payload).encode("utf-8")

    def read(self) -> None:  # mirrors urllib3 HTTPResponse.read()
        return None


# --------------------------------------------------------------------------- #
# fetch_ohlcv (client.py)                                                     #
# --------------------------------------------------------------------------- #


def _capture_ohlcv_params(monkeypatch, **kwargs) -> Dict[str, Any]:
    exchange = Mock(auto_start_server=False)
    captured: Dict[str, Any] = {}

    def fake_sidecar_read_request(method_name, query, args):
        captured["params"] = args[1]
        return {"success": True, "data": []}

    monkeypatch.setattr(exchange, "_sidecar_read_request", fake_sidecar_read_request)
    candles = exchange.fetch_ohlcv("outcome-123", resolution="1h", **kwargs)
    assert candles == []
    return captured["params"]


def test_fetch_ohlcv_naive_datetimes_serialized_as_utc(monkeypatch):
    params = _capture_ohlcv_params(
        monkeypatch,
        start=datetime(2026, 1, 1),
        end=datetime(2026, 1, 31, 23, 59, 59),
    )

    assert params["start"] == "2026-01-01T00:00:00.000Z"
    assert params["end"] == "2026-01-31T23:59:59.000Z"


def test_fetch_ohlcv_aware_datetimes_converted_to_utc(monkeypatch):
    pst = timezone(timedelta(hours=-8))
    params = _capture_ohlcv_params(monkeypatch, start=datetime(2026, 1, 1, tzinfo=pst))

    # Same instant as TS: new Date("2026-01-01T00:00:00-08:00").toISOString()
    assert params["start"] == "2026-01-01T08:00:00.000Z"


def test_fetch_ohlcv_microseconds_truncated_to_milliseconds(monkeypatch):
    params = _capture_ohlcv_params(
        monkeypatch, start=datetime(2026, 6, 15, 12, 30, 45, 123456)
    )

    assert params["start"] == "2026-06-15T12:30:45.123Z"


# --------------------------------------------------------------------------- #
# Router updatedSince (router.py _normalize_query_value)                       #
# --------------------------------------------------------------------------- #


def _captured_updated_since(monkeypatch, **kwargs) -> str:
    router = Router(
        pmxt_api_key=PMXT_API_KEY, base_url=BASE_URL, auto_start_server=False
    )
    calls = []

    def fake_call_api(method=None, url=None, body=None, header_params=None, **kw):
        calls.append({"method": method, "url": url})
        return _FakeResponse({"data": []})

    monkeypatch.setattr(router._api_client, "call_api", fake_call_api)
    router.fetch_matched_event_clusters(**kwargs)

    query = parse_qs(urlparse(calls[0]["url"]).query)
    return query["updatedSince"][0]


def test_router_updated_since_naive_datetime_serialized_as_utc(monkeypatch):
    value = _captured_updated_since(
        monkeypatch, updated_since=datetime(2026, 1, 2, 3, 4, 5)
    )

    assert value == "2026-01-02T03:04:05.000Z"


def test_router_updated_since_aware_datetime_converted_to_utc(monkeypatch):
    jst = timezone(timedelta(hours=9))
    value = _captured_updated_since(
        monkeypatch, updated_since=datetime(2026, 1, 2, 12, 0, 0, tzinfo=jst)
    )

    assert value == "2026-01-02T03:00:00.000Z"


def test_router_updated_since_bare_date_is_utc_midnight(monkeypatch):
    value = _captured_updated_since(monkeypatch, updated_since=date(2026, 1, 1))

    assert value == "2026-01-01T00:00:00.000Z"


def test_router_matches_typescript_date_toisostring_output(monkeypatch):
    # router.ts sends new Date(Date.UTC(2026, 0, 1)).toISOString() for this input.
    value = _captured_updated_since(monkeypatch, updated_since=datetime(2026, 1, 1))

    assert value == "2026-01-01T00:00:00.000Z"


def test_router_string_values_pass_through_unchanged(monkeypatch):
    value = _captured_updated_since(monkeypatch, updated_since="2026-01-02T03:04:05Z")

    assert value == "2026-01-02T03:04:05Z"
