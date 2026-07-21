import threading
import time
import socket
import sys
import types

import pytest

import pmxt.ws_client as ws_client
from pmxt.errors import PmxtError
from pmxt.ws_client import SidecarWsClient, _WsSubscription, _connect_websocket


def _register_subscription(client, request_id="req-firehose"):
    sub = _WsSubscription(request_id, "watchAllOrderBooks", [])
    with client._lock:
        client._subscriptions[request_id] = sub
        client._active_subs["watchAllOrderBooks:"] = request_id
    return sub


def test_queues_repeated_data_events_in_fifo_order():
    client = SidecarWsClient("http://localhost:3847")
    _register_subscription(client)

    client._dispatch({"event": "data", "id": "req-firehose", "symbol": "a", "data": {"sequence": 1}})
    client._dispatch({"event": "data", "id": "req-firehose", "symbol": "b", "data": {"sequence": 2}})
    client._dispatch({"event": "data", "id": "req-firehose", "symbol": "c", "data": {"sequence": 3}})

    assert client.subscribe("mock", "watchAllOrderBooks", [], timeout=0.1) == {"sequence": 1}
    assert client.subscribe("mock", "watchAllOrderBooks", [], timeout=0.1) == {"sequence": 2}
    assert client.subscribe("mock", "watchAllOrderBooks", [], timeout=0.1) == {"sequence": 3}


def test_resolves_pending_waiter_and_queues_later_events():
    client = SidecarWsClient("http://localhost:3847")
    _register_subscription(client, "req-pending")
    result = []

    thread = threading.Thread(
        target=lambda: result.append(client.subscribe("mock", "watchAllOrderBooks", [], timeout=1.0))
    )
    thread.start()
    time.sleep(0.05)

    client._dispatch({"event": "data", "id": "req-pending", "symbol": "a", "data": {"sequence": 1}})
    client._dispatch({"event": "data", "id": "req-pending", "symbol": "b", "data": {"sequence": 2}})

    thread.join(timeout=1.0)
    assert result == [{"sequence": 1}]
    assert client.subscribe("mock", "watchAllOrderBooks", [], timeout=0.1) == {"sequence": 2}


def test_close_clears_queued_events():
    client = SidecarWsClient("http://localhost:3847")
    _register_subscription(client, "req-close")

    client._dispatch({"event": "data", "id": "req-close", "symbol": "a", "data": {"sequence": 1}})
    client._dispatch({"event": "data", "id": "req-close", "symbol": "b", "data": {"sequence": 2}})

    assert len(client._data_queues["req-close"]) == 2
    client.close()
    assert "req-close" not in client._data_queues
    assert client._data_store == {}


def test_drops_oldest_queued_events_after_cap():
    client = SidecarWsClient("http://localhost:3847")
    _register_subscription(client, "req-overflow")

    for sequence in range(1, 100_002):
        client._dispatch({
            "event": "data",
            "id": "req-overflow",
            "symbol": str(sequence),
            "data": {"sequence": sequence},
        })

    assert len(client._data_queues["req-overflow"]) == 100_000
    assert client.subscribe("mock", "watchAllOrderBooks", [], timeout=0.1) == {"sequence": 2}
    assert client.subscribe("mock", "watchAllOrderBooks", [], timeout=0.1) == {"sequence": 3}


def test_hosted_websocket_connect_prefers_ipv4(monkeypatch):
    original = socket.getaddrinfo

    def fake_getaddrinfo(*_args, **_kwargs):
        return [
            (socket.AF_INET6, None, None, None, ("::1", 443, 0, 0)),
            (socket.AF_INET, None, None, None, ("127.0.0.1", 443)),
        ]

    observed = {}

    class FakeWebSocket:
        def connect(self, url, timeout):
            observed["url"] = url
            observed["timeout"] = timeout
            observed["families"] = [item[0] for item in socket.getaddrinfo("api.pmxt.dev", 443)]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    _connect_websocket(FakeWebSocket(), "wss://api.pmxt.dev/ws?apiKey=test", timeout=10)

    assert observed["url"] == "wss://api.pmxt.dev/ws?apiKey=test"
    assert observed["timeout"] == 10
    assert observed["families"] == [socket.AF_INET, socket.AF_INET6]
    assert socket.getaddrinfo is fake_getaddrinfo
    monkeypatch.setattr(socket, "getaddrinfo", original)


def _install_failing_websocket(monkeypatch, urls, on_connect=None):
    class FakeWebSocket:
        def settimeout(self, _timeout):
            return None

        def close(self):
            return None

    monkeypatch.setitem(sys.modules, "websocket", types.SimpleNamespace(WebSocket=FakeWebSocket))

    def fake_connect(_ws, url, timeout):
        urls.append(url)
        if on_connect:
            on_connect()
        raise OSError("handshake failure")

    monkeypatch.setattr(ws_client, "_connect_websocket", fake_connect)


def test_ws_config_custom_url_and_reconnect_interval(monkeypatch):
    urls = []
    sleeps = []
    monkeypatch.setattr(ws_client.time, "sleep", lambda seconds: sleeps.append(seconds))
    _install_failing_websocket(monkeypatch, urls)

    client = SidecarWsClient(
        "http://localhost:3847",
        config={"wsUrl": "ws://custom.example.com/ws", "maxReconnectAttempts": 2, "reconnectInterval": 2000},
    )
    try:
        with client._lock:
            client._ensure_connected()
    except OSError:
        pass

    # maxReconnectAttempts honored (2 attempts) and the custom URL is used.
    assert urls == ["ws://custom.example.com/ws", "ws://custom.example.com/ws"]
    # A configured reconnectInterval (2000ms) is applied between attempts.
    assert sleeps == [2.0]


def test_ws_none_reconnect_attempts_uses_default(monkeypatch):
    urls = []
    _install_failing_websocket(monkeypatch, urls)

    client = SidecarWsClient(
        "http://localhost:3847", config={"maxReconnectAttempts": None}
    )
    with pytest.raises(OSError, match="handshake failure"):
        with client._lock:
            client._ensure_connected()

    assert len(urls) == 3


def test_ws_zero_reconnect_attempts_is_honored(monkeypatch):
    urls = []
    _install_failing_websocket(monkeypatch, urls)

    client = SidecarWsClient(
        "http://localhost:3847", config={"maxReconnectAttempts": 0}
    )
    with pytest.raises(PmxtError, match="WebSocket connection failed"):
        with client._lock:
            client._ensure_connected()

    assert urls == []


def test_ws_default_backoff_is_fast(monkeypatch):
    """Regression: the default reconnect backoff must stay 0.25s/0.5s, not a
    flat multi-second sleep, unless an interval is explicitly configured."""
    urls = []
    sleeps = []
    monkeypatch.setattr(ws_client.time, "sleep", lambda seconds: sleeps.append(seconds))
    _install_failing_websocket(monkeypatch, urls)

    client = SidecarWsClient("http://localhost:3847")  # no websocket config
    try:
        with client._lock:
            client._ensure_connected()
    except OSError:
        pass

    # 3 default attempts -> 2 backoff sleeps using the fast schedule.
    assert sleeps == [0.25, 0.5]


def test_connect_retries_transient_handshake_failures(monkeypatch):
    attempts = {"count": 0}

    class FakeWebSocket:
        def settimeout(self, _timeout):
            return None

        def close(self):
            return None

    monkeypatch.setitem(sys.modules, "websocket", types.SimpleNamespace(WebSocket=FakeWebSocket))

    def fake_connect(_ws, _url, timeout):
        assert timeout == 10
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise OSError("transient handshake failure")

    monkeypatch.setattr(ws_client, "_connect_websocket", fake_connect)
    monkeypatch.setattr(ws_client.time, "sleep", lambda _seconds: None)

    client = SidecarWsClient("https://api.pmxt.dev", api_key="pmxt_test")
    with client._lock:
        client._ensure_connected()

    assert attempts["count"] == 3
    assert client._ws is not None
