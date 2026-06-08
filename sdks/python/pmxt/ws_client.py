"""
WebSocket client for streaming methods.

Provides a multiplexed WebSocket connection to the sidecar server,
used by watch_order_book and watch_order_books as an alternative to
HTTP long-polling. Falls back to HTTP transparently when the sidecar
does not support the /ws endpoint.
"""

import json
import socket
import threading
import time
import uuid
from collections import deque
from typing import Any, Deque, Dict, List, Optional
from urllib.parse import urlparse

from .errors import PmxtError

MAX_QUEUED_MESSAGES_PER_SUBSCRIPTION = 100_000
CONNECT_ATTEMPTS = 3
_NO_DATA = object()


def _connect_websocket(ws: Any, url: str, timeout: float) -> None:
    """Connect, preferring IPv4 for hosted pmxt custom-domain websockets."""
    host = urlparse(url).hostname
    if host != "api.pmxt.dev":
        ws.connect(url, timeout=timeout)
        return

    original_getaddrinfo = socket.getaddrinfo

    def getaddrinfo_ipv4_first(*args: Any, **kwargs: Any) -> Any:
        results = original_getaddrinfo(*args, **kwargs)
        ipv4 = [item for item in results if item[0] == socket.AF_INET]
        other = [item for item in results if item[0] != socket.AF_INET]
        return ipv4 + other

    socket.getaddrinfo = getaddrinfo_ipv4_first
    try:
        ws.connect(url, timeout=timeout)
    finally:
        socket.getaddrinfo = original_getaddrinfo


class _WsSubscription:
    """Tracks a single subscription and its pending data event."""

    __slots__ = ("request_id", "method", "symbols", "event")

    def __init__(self, request_id: str, method: str, symbols: List[str]) -> None:
        self.request_id = request_id
        self.method = method
        self.symbols = symbols
        self.event = threading.Event()


class SidecarWsClient:
    """Multiplexed WebSocket client for the pmxt sidecar.

    Lazily connects to ws://{host}/ws?token={access_token}. A single
    background thread reads incoming frames and dispatches them to
    pending subscriptions by request id / symbol. Thread-safe -- callers
    may invoke subscribe/receive from any thread.
    """

    def __init__(self, host: str, access_token: Optional[str] = None, api_key: Optional[str] = None) -> None:
        self._host = host
        self._access_token = access_token
        self._api_key = api_key
        self._ws: Any = None
        self._lock = threading.Lock()
        self._reader_thread: Optional[threading.Thread] = None
        self._closed = False

        # request_id -> queued data payloads for single-event watch methods
        self._data_queues: Dict[str, Deque[Dict[str, Any]]] = {}
        # request_id[:symbol] -> latest data payload for batch snapshots/errors
        self._data_store: Dict[str, Dict[str, Any]] = {}
        # request_id -> subscription metadata
        self._subscriptions: Dict[str, _WsSubscription] = {}
        # Track active subscriptions by (method, symbol_key) -> request_id
        # to avoid duplicate subscribe messages for the same ticker
        self._active_subs: Dict[str, str] = {}

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    def _ensure_connected(self) -> None:
        """Connect if not already connected. Must be called under _lock."""
        if self._ws is not None and not self._closed:
            return

        try:
            import websocket  # websocket-client
        except ImportError:
            raise PmxtError(
                "WebSocket support requires the 'websocket-client' package. "
                "Install it with: pip install websocket-client"
            )

        scheme = "ws"
        # Strip http(s):// prefix from host to build ws URL
        host_part = self._host
        if host_part.startswith("https://"):
            host_part = host_part[len("https://"):]
            scheme = "wss"
        elif host_part.startswith("http://"):
            host_part = host_part[len("http://"):]

        url = f"{scheme}://{host_part}/ws"
        if self._api_key:
            url = f"{url}?apiKey={self._api_key}"
        elif self._access_token:
            url = f"{url}?token={self._access_token}"

        last_error: Optional[Exception] = None
        ws = None
        for attempt in range(CONNECT_ATTEMPTS):
            ws = websocket.WebSocket()
            try:
                _connect_websocket(ws, url, timeout=10)
                last_error = None
                break
            except Exception as exc:
                last_error = exc
                try:
                    ws.close()
                except Exception:
                    pass
                if attempt < CONNECT_ATTEMPTS - 1:
                    time.sleep(0.25 * (attempt + 1))

        if last_error is not None:
            raise last_error
        if ws is None:
            raise PmxtError("WebSocket connection failed")
        ws.settimeout(None)
        self._ws = ws
        self._closed = False

        # Start reader thread
        self._reader_thread = threading.Thread(
            target=self._read_loop, daemon=True, name="pmxt-ws-reader"
        )
        self._reader_thread.start()

    def _read_loop(self) -> None:
        """Background thread: read frames and dispatch to subscribers."""
        disconnect_error: Optional[str] = None
        while not self._closed:
            try:
                raw = self._ws.recv()
                if not raw:
                    disconnect_error = "WebSocket connection closed by server"
                    break
                msg = json.loads(raw)
                self._dispatch(msg)
            except Exception as e:
                disconnect_error = f"WebSocket connection lost: {e}"
                break

        self._closed = True
        # Wake all pending subscribers so they fail fast instead of timing out
        error_msg = disconnect_error or "WebSocket connection closed"
        with self._lock:
            for request_id, sub in list(self._subscriptions.items()):
                if not sub.event.is_set():
                    self._enqueue_data_locked(request_id, {
                        "_error": {"message": error_msg}
                    })

    def _dispatch(self, msg: Dict[str, Any]) -> None:
        """Route an incoming server message to the matching subscription."""
        event_type = msg.get("event")
        request_id = msg.get("id")

        if event_type == "error":
            # Wake up any waiter with the error stored
            if request_id:
                with self._lock:
                    self._data_store[request_id] = {"_error": msg.get("error", {})}
                    self._enqueue_data_locked(request_id, {"_error": msg.get("error", {})})
            return

        if event_type == "subscribed":
            # Acknowledgement -- nothing to do
            return

        if event_type == "data" and request_id:
            symbol = msg.get("symbol", "")
            data = msg.get("data", {})
            with self._lock:
                # Store keyed by (request_id, symbol) for batch methods
                store_key = f"{request_id}:{symbol}"
                self._data_store[store_key] = data
                self._enqueue_data_locked(request_id, data)

    def _enqueue_data_locked(self, request_id: str, data: Dict[str, Any]) -> None:
        queue = self._data_queues.setdefault(request_id, deque())
        queue.append(data)
        while len(queue) > MAX_QUEUED_MESSAGES_PER_SUBSCRIPTION:
            queue.popleft()

        sub = self._subscriptions.get(request_id)
        if sub:
            sub.event.set()

    def _pop_data_locked(self, request_id: str) -> Any:
        queue = self._data_queues.get(request_id)
        if not queue:
            return _NO_DATA

        data = queue.popleft()
        if not queue:
            self._data_queues.pop(request_id, None)
            sub = self._subscriptions.get(request_id)
            if sub:
                sub.event.clear()
        return data

    def _wait_for_subscription_data(
        self,
        sub: _WsSubscription,
        timeout: float,
    ) -> Dict[str, Any]:
        with self._lock:
            data = self._pop_data_locked(sub.request_id)
            if data is _NO_DATA:
                sub.event.clear()

        if data is _NO_DATA:
            if not sub.event.wait(timeout=timeout):
                raise PmxtError(f"Timeout waiting for WebSocket data (method={sub.method})")

            with self._lock:
                data = self._pop_data_locked(sub.request_id)

        if data is _NO_DATA:
            return {}

        if isinstance(data, dict) and "_error" in data:
            err = data["_error"]
            raise PmxtError(
                err.get("message", "WebSocket subscription error")
            )

        return data

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def subscribe(
        self,
        exchange: str,
        method: str,
        args: List[Any],
        credentials: Optional[Dict[str, Any]] = None,
        timeout_ms: float = 30000.0,
        timeout: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Send a subscribe message and block until the first data event.

        Returns the raw data payload from the server.
        """
        # Build a sub key to check for existing subscriptions.
        # For watchOrderBook the first arg is the symbol string.
        # For watchOrderBooks the first arg is a list of symbols.
        first_arg = args[0] if args else ""
        if isinstance(first_arg, list):
            sub_key = f"{method}:{','.join(sorted(first_arg))}"
        else:
            sub_key = f"{method}:{first_arg}"

        with self._lock:
            # Reuse existing subscription if one is live
            existing_id = self._active_subs.get(sub_key)
            if existing_id and existing_id in self._subscriptions:
                sub = self._subscriptions[existing_id]
            else:
                self._ensure_connected()
                request_id = f"req-{uuid.uuid4().hex[:12]}"
                symbols = args[0] if args and isinstance(args[0], list) else [args[0]] if args else []

                sub = _WsSubscription(request_id, method, symbols)
                self._subscriptions[request_id] = sub
                self._active_subs[sub_key] = request_id

                # Send subscribe frame
                message = {
                    "id": request_id,
                    "action": "subscribe",
                    "exchange": exchange,
                    "method": method,
                    "args": args,
                }
                if credentials:
                    message["credentials"] = credentials

                self._ws.send(json.dumps(message))

        effective_timeout = timeout if timeout is not None else timeout_ms / 1000.0
        return self._wait_for_subscription_data(sub, effective_timeout)

    def subscribe_batch(
        self,
        exchange: str,
        method: str,
        args: List[Any],
        credentials: Optional[Dict[str, Any]] = None,
        timeout_ms: float = 30000.0,
        timeout: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Subscribe to a batch method (e.g. watchOrderBooks) and collect
        data events for all symbols.

        Returns a dict mapping symbol -> raw data payload.
        """
        symbols = args[0] if args and isinstance(args[0], list) else []

        with self._lock:
            self._ensure_connected()
            request_id = f"req-{uuid.uuid4().hex[:12]}"

            sub = _WsSubscription(request_id, method, symbols)
            self._subscriptions[request_id] = sub

            message = {
                "id": request_id,
                "action": "subscribe",
                "exchange": exchange,
                "method": method,
                "args": args,
            }
            if credentials:
                message["credentials"] = credentials

            self._ws.send(json.dumps(message))

        # Wait for data event (the server may push one consolidated event
        # or multiple per-symbol events)
        effective_timeout = timeout if timeout is not None else timeout_ms / 1000.0
        first_data = self._wait_for_subscription_data(sub, effective_timeout)

        # Collect per-symbol data
        result: Dict[str, Any] = {}
        for symbol in symbols:
            store_key = f"{request_id}:{symbol}"
            if store_key in self._data_store:
                result[symbol] = self._data_store[store_key]
        # If no per-symbol data found, return the single data event
        # (server may return a dict of all order books in one push)
        if not result:
            result = first_data
        return result

    def close(self) -> None:
        """Close the WebSocket connection."""
        self._closed = True
        if self._ws:
            try:
                self._ws.close()
            except Exception as e:
                import logging
                logging.warning("WebSocket close error: %s", e)
            self._ws = None
        with self._lock:
            self._data_queues.clear()
            self._data_store.clear()

    @property
    def connected(self) -> bool:
        """True if the WebSocket is currently connected."""
        return self._ws is not None and not self._closed
