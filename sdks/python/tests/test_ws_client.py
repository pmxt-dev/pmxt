import importlib.util
import logging
import pathlib
import threading
import time
import socket
import sys
import types


def _load_ws_client_module():
    """Load pmxt.ws_client without requiring generated pmxt_internal artifacts."""
    package_dir = pathlib.Path(__file__).resolve().parents[1] / "pmxt"
    package = sys.modules.setdefault("pmxt", types.ModuleType("pmxt"))
    package.__path__ = [str(package_dir)]

    errors_spec = importlib.util.spec_from_file_location("pmxt.errors", package_dir / "errors.py")
    errors_module = importlib.util.module_from_spec(errors_spec)
    sys.modules["pmxt.errors"] = errors_module
    errors_spec.loader.exec_module(errors_module)

    spec = importlib.util.spec_from_file_location("pmxt.ws_client", package_dir / "ws_client.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["pmxt.ws_client"] = module
    spec.loader.exec_module(module)
    return module


ws_client = _load_ws_client_module()
SidecarWsClient = ws_client.SidecarWsClient
_WsSubscription = ws_client._WsSubscription
_connect_websocket = ws_client._connect_websocket


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


def test_logs_failed_cleanup_when_retrying_handshake_failure(monkeypatch, caplog):
    class FakeWebSocket:
        def close(self):
            raise RuntimeError("close failed")

    def fail_connect(*_args, **_kwargs):
        raise OSError("handshake failed")

    monkeypatch.setitem(sys.modules, "websocket", types.SimpleNamespace(WebSocket=FakeWebSocket))
    monkeypatch.setattr(ws_client, "_connect_websocket", fail_connect)
    monkeypatch.setattr(ws_client.time, "sleep", lambda _seconds: None)

    client = SidecarWsClient("https://api.pmxt.dev", api_key="pmxt_test")

    with caplog.at_level(logging.DEBUG, logger="pmxt.ws_client"):
        try:
            with client._lock:
                client._ensure_connected()
        except OSError as exc:
            assert str(exc) == "handshake failed"
        else:
            raise AssertionError("expected handshake failure")

    assert "Failed to close unsuccessful WebSocket connection" in caplog.text
    assert "close failed" in caplog.text
