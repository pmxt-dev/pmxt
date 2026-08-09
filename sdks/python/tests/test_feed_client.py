import io
import json
import urllib.error
import urllib.request

import pytest

from pmxt.errors import PmxtError
from pmxt.feed_client import FeedClient


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self._payload).encode("utf-8")


def test_list_feeds_hits_the_root_endpoint(monkeypatch):
    captured = {}

    def fake_urlopen(req, timeout=15):
        captured["url"] = req.full_url
        captured["headers"] = dict(req.header_items())
        captured["timeout"] = timeout
        return _FakeResponse({"success": True, "data": ["binance", "chainlink"]})

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    client = FeedClient("binance", base_url="http://localhost:3847")

    assert client.list_feeds() == ["binance", "chainlink"]
    assert captured["url"] == "http://localhost:3847/api/feeds/"
    assert captured["timeout"] == 30
    assert captured["headers"] == {}


def test_http_error_with_non_json_body_raises_pmxt_error(monkeypatch):
    error = urllib.error.HTTPError(
        "https://api.pmxt.dev/api/feeds/",
        502,
        "Bad Gateway",
        {},
        io.BytesIO(b"<html>upstream unavailable</html>"),
    )

    def fake_urlopen(req, timeout=30):
        raise error

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    client = FeedClient("chainlink", base_url="https://api.pmxt.dev")

    with pytest.raises(PmxtError, match=r"Feed API error \(502\): Bad Gateway") as excinfo:
        client.list_feeds()

    assert excinfo.value.__cause__ is error


def test_http_error_with_invalid_utf8_body_raises_pmxt_error(monkeypatch):
    invalid_utf8 = b"\x80"
    with pytest.raises(UnicodeDecodeError):
        json.loads(invalid_utf8)

    error = urllib.error.HTTPError(
        "https://api.pmxt.dev/api/feeds/",
        502,
        "Bad Gateway",
        {},
        io.BytesIO(invalid_utf8),
    )

    def fake_urlopen(req, timeout=30):
        raise error

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    client = FeedClient("chainlink", base_url="https://api.pmxt.dev")

    with pytest.raises(PmxtError, match=r"Feed API error \(502\): Bad Gateway") as excinfo:
        client.list_feeds()

    assert excinfo.value.__cause__ is error


def test_http_error_with_json_body_uses_api_error(monkeypatch):
    error = urllib.error.HTTPError(
        "https://api.pmxt.dev/api/feeds/",
        429,
        "Too Many Requests",
        {},
        io.BytesIO(b'{"error": "rate limit exceeded"}'),
    )

    def fake_urlopen(req, timeout=30):
        raise error

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    client = FeedClient("chainlink", base_url="https://api.pmxt.dev")

    with pytest.raises(PmxtError, match=r"Feed API error \(429\): rate limit exceeded") as excinfo:
        client.list_feeds()

    assert excinfo.value.__cause__ is error
