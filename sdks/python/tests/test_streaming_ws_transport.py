import json
import threading

import pytest

from pmxt.client import Exchange
from pmxt.errors import PmxtError
from pmxt.models import OrderBook, Trade


def _exchange() -> Exchange:
    return Exchange("mock", base_url="http://127.0.0.1:9", auto_start_server=False)


def _raw_order_book() -> dict:
    return {
        "bids": [{"price": 0.4, "size": 10}],
        "asks": [{"price": 0.6, "size": 12}],
        "timestamp": 123,
    }


def _raw_trade() -> dict:
    return {
        "id": "trade-1",
        "timestamp": 123,
        "price": 0.55,
        "amount": 4,
        "side": "buy",
    }


@pytest.mark.parametrize(
    ("method_name", "args", "message"),
    [
        ("watch_order_book", ("outcome-1",), "watch_order_book() requires WebSocket transport"),
        ("watch_order_books", (["outcome-1"],), "watch_order_books() requires WebSocket transport"),
        ("watch_trades", ("outcome-1",), "watch_trades() requires WebSocket transport"),
        ("unwatch_order_book", ("outcome-1",), "unwatch_order_book() requires WebSocket transport"),
    ],
)
def test_streaming_methods_require_websocket_transport(monkeypatch, method_name, args, message):
    exchange = _exchange()
    monkeypatch.setattr(exchange, "_get_or_create_ws", lambda: None)
    monkeypatch.setattr(
        exchange,
        "_fetch_with_retry",
        lambda _fn: pytest.fail("streaming method attempted HTTP fallback"),
    )

    with pytest.raises(PmxtError) as excinfo:
        getattr(exchange, method_name)(*args)
    assert message in str(excinfo.value)


def test_watch_order_book_uses_websocket_transport(monkeypatch):
    exchange = _exchange()
    calls = []
    monkeypatch.setattr(
        exchange,
        "_watch_via_ws",
        lambda method, args: calls.append((method, args)) or _raw_order_book(),
    )
    monkeypatch.setattr(
        exchange,
        "_fetch_with_retry",
        lambda _fn: pytest.fail("watch_order_book attempted HTTP fallback"),
    )

    book = exchange.watch_order_book("outcome-1", limit=5, params={"depth": "full"})

    assert calls == [("watchOrderBook", ["outcome-1", 5, {"depth": "full"}])]
    assert isinstance(book, OrderBook)
    assert book.bids[0].price == 0.4


def test_watch_order_books_uses_websocket_batch_transport(monkeypatch):
    exchange = _exchange()

    class FakeWs:
        connected = True

        def subscribe_batch(self, **kwargs):
            self.kwargs = kwargs
            return {"outcome-1": _raw_order_book()}

    fake_ws = FakeWs()
    monkeypatch.setattr(exchange, "_get_or_create_ws", lambda: fake_ws)
    monkeypatch.setattr(
        exchange,
        "_fetch_with_retry",
        lambda _fn: pytest.fail("watch_order_books attempted HTTP fallback"),
    )

    books = exchange.watch_order_books(["outcome-1"], limit=3)

    assert fake_ws.kwargs["method"] == "watchOrderBooks"
    assert fake_ws.kwargs["args"] == [["outcome-1"], 3]
    assert isinstance(books["outcome-1"], OrderBook)


def test_watch_trades_uses_websocket_transport(monkeypatch):
    exchange = _exchange()
    calls = []
    monkeypatch.setattr(
        exchange,
        "_watch_via_ws",
        lambda method, args: calls.append((method, args)) or [_raw_trade()],
    )
    monkeypatch.setattr(
        exchange,
        "_fetch_with_retry",
        lambda _fn: pytest.fail("watch_trades attempted HTTP fallback"),
    )

    trades = exchange.watch_trades("outcome-1", address="0xabc", since=10, limit=2)

    assert calls == [("watchTrades", ["outcome-1", "0xabc", 10, 2])]
    assert isinstance(trades[0], Trade)
    assert trades[0].id == "trade-1"


def test_unwatch_order_book_sends_websocket_unsubscribe(monkeypatch):
    exchange = _exchange()

    class FakeSocket:
        def __init__(self):
            self.sent = []

        def send(self, raw):
            self.sent.append(json.loads(raw))

    class FakeWs:
        connected = True

        def __init__(self):
            self._lock = threading.Lock()
            self._ws = FakeSocket()
            self._active_subs = {"watchOrderBook:outcome-1": "req-existing"}
            self._subscriptions = {"req-existing": object()}
            self._data_store = {"req-existing": _raw_order_book()}

        def _ensure_connected(self):
            return None

    fake_ws = FakeWs()
    monkeypatch.setattr(exchange, "_get_or_create_ws", lambda: fake_ws)
    monkeypatch.setattr(
        exchange,
        "_fetch_with_retry",
        lambda _fn: pytest.fail("unwatch_order_book attempted HTTP fallback"),
    )

    exchange.unwatch_order_book("outcome-1")

    assert fake_ws._ws.sent[0]["action"] == "unsubscribe"
    assert fake_ws._ws.sent[0]["id"] == "req-existing"
    assert fake_ws._ws.sent[0]["exchange"] == "mock"
    assert fake_ws._ws.sent[0]["method"] == "unwatchOrderBook"
    assert fake_ws._ws.sent[0]["args"] == ["outcome-1"]
    assert "watchOrderBook:outcome-1" not in fake_ws._active_subs
    assert "req-existing" not in fake_ws._subscriptions
    assert "req-existing" not in fake_ws._data_store
