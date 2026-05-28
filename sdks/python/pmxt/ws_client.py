"""
WebSocket client for streaming methods.

Provides a multiplexed WebSocket connection to the local service server,
used by watch_order_book and watch_order_books as an alternative to
HTTP long-polling. Falls back to HTTP transparently when the local service
does not support the /ws endpoint.
"""

import json
import threading
import uuid
from typing import Any, Callable, Dict, List, Optional

from .errors import PmxtError


class _WsSubscription:
    """Tracks a single subscription and its pending data event."""

    __slots__ = ("request_id", "method", "symbols", "event")

    def __init__(self, request_id: str, method: str, symbols: List[str]):
        self.request_id = request_id
        self.method = method
        self.symbols = symbols
        self.event = threading.Event()


class SidecarWsClient:
    """Multiplexed WebSocket client for the pmxt local service.

    Lazily connects to ws://{host}/ws?token={access_token}. A single
    background thread reads incoming frames and dispatches them to
    pending subscriptions by request id / symbol. Thread-safe -- callers
    may invoke subscribe/receive from any thread.
    """

    def __init__(self, host: str, access_token: Optional[str] = None, api_key: Optional[str] = None):
        self._host = host
        self._access_token = access_token
        self._api_key = api_key
        self._ws: Any = None
        self._lock = threading.Lock()
        self._reader_thread: Optional[threading.Thread] = None
        self._closed = False

        # request_id -> latest data payload
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

        ws = websocket.WebSocket()
        ws.connect(url, timeout=10)
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
                    self._data_store[request_id] = {
                        "_error": {"message": error_msg}
                    }
                    sub.event.set()

    def _dispatch(self, msg: Dict[str, Any]) -> None:
        """Route an incoming server message to the matching subscription."""
        event_type = msg.get("event")
        request_id = msg.get("id")

        if event_type == "error":
            # Wake up any waiter with the error stored
            if request_id and request_id in self._subscriptions:
                sub = self._subscriptions[request_id]
                self._data_store[request_id] = {"_error": msg.get("error", {})}
                sub.event.set()
            return

        if event_type == "subscribed":
            # Acknowledgement -- nothing to do
            return

        if event_type == "data" and request_id:
            symbol = msg.get("symbol", "")
            data = msg.get("data", {})
            # Store keyed by (request_id, symbol) for batch methods
            store_key = f"{rid}:{symbol}"
            self._data_store[store_key] = data
            # Also store by request_id alone for single-symbol methods
            self._data_store[request_id] = data
            if request_id in self._subscriptions:
                sub = self._subscriptions[request_id]
                sub.event.set()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def subscribe(
        self,
        exchange: str,
        method: str,
        args: List[Any],
        credentials: Optional[Dict[str, Any]] = None,
        timeout: float = 30.0,
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
                # Clear previous event so we wait for the NEXT push
                sub.event.clear()
                # Clear stale data
                self._data_store.pop(existing_id, None)
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

        # Block until data arrives
        if not sub.event.wait(timeout=timeout):
            raise PmxtError(f"Timeout waiting for WebSocket data (method={method})")

        # Check for error
        error_data = self._data_store.get(sub.request_id, {})
        if isinstance(error_data, dict) and "_error" in error_data:
            err = error_data["_error"]
            raise PmxtError(
                err.get("message", "WebSocket subscription error")
            )

        return self._data_store.get(sub.request_id, {})

    def subscribe_batch(
        self,
        exchange: str,
        method: str,
        args: List[Any],
        credentials: Optional[Dict[str, Any]] = None,
        timeout: float = 30.0,
    ) -> Dict[str, Any]:
        """Subscribe to a batch method (e.g. watchOrderBooks) and collect
        data events for all symbols.

        Returns a dict mapping symbol -> raw data payload.
        """
        symbols = args[0] if args and isinstance(args[0], list) else []

        first_arg = args[0] if args else ""
        if isinstance(first_arg, list):
            sub_key = f"{method}:{','.join(sorted(first_arg))}"
        else:
            sub_key = f"{method}:{first_arg}"

        with self._lock:
            existing_id = self._active_subs.get(sub_key)
            if existing_id and existing_id in self._subscriptions:
                sub = self._subscriptions[existing_id]
                sub.event.clear()
                self._data_store.pop(existing_id, None)
                for symbol in symbols:
                    self._data_store.pop(f"{existing_id}:{symbol}", None)
            else:
                self._ensure_connected()
                request_id = f"req-{uuid.uuid4().hex[:12]}"

                sub = _WsSubscription(request_id, method, symbols)
                self._subscriptions[request_id] = sub
                self._active_subs[sub_key] = request_id

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
        if not sub.event.wait(timeout=timeout):
            raise PmxtError(f"Timeout waiting for WebSocket data (method={method})")

        # Check for error
        rid = sub.request_id
        error_data = self._data_store.get(rid, {})
        if isinstance(error_data, dict) and "_error" in error_data:
            err = error_data["_error"]
            raise PmxtError(
                err.get("message", "WebSocket subscription error")
            )

        # Collect per-symbol data
        result: Dict[str, Any] = {}
        for symbol in symbols:
            store_key = f"{rid}:{symbol}"
            if store_key in self._data_store:
                result[symbol] = self._data_store[store_key]
        # If no per-symbol data found, return the single data event
        # (server may return a dict of all order books in one push)
        if not result:
            data = self._data_store.get(rid, {})
            if isinstance(data, dict) and not data.get("_error"):
                result = data
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

    @property
    def connected(self) -> bool:
        """True if the WebSocket is currently connected."""
        return self._ws is not None and not self._closed
