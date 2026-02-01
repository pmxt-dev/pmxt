"""
Exchange client implementations.

This module provides clean, Pythonic wrappers around the auto-generated
OpenAPI client, matching the JavaScript API exactly.
"""

import os
import sys
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from abc import ABC, abstractmethod
import json

# Add generated client to path
_GENERATED_PATH = os.path.join(os.path.dirname(__file__), "..", "generated")
if _GENERATED_PATH not in sys.path:
    sys.path.insert(0, _GENERATED_PATH)

from pmxt_internal import ApiClient, Configuration
from pmxt_internal.api.default_api import DefaultApi
from pmxt_internal.exceptions import ApiException
from pmxt_internal import models as internal_models

from .models import (
    UnifiedMarket,
    UnifiedEvent,
    MarketOutcome,
    PriceCandle,
    OrderBook,
    OrderLevel,
    Trade,
    Order,
    Position,
    Balance,
    MarketFilterParams,
    HistoryFilterParams,
    CreateOrderParams,
    ExecutionPriceResult,
)
from .server_manager import ServerManager


def _convert_outcome(raw: Dict[str, Any]) -> MarketOutcome:
    """Convert raw API response to MarketOutcome."""
    return MarketOutcome(
        id=raw.get("id"),
        label=raw.get("label"),
        price=raw.get("price"),
        price_change_24h=raw.get("priceChange24h"),
        metadata=raw.get("metadata"),
    )


def _convert_market(raw: Dict[str, Any]) -> UnifiedMarket:
    """Convert raw API response to UnifiedMarket."""
    outcomes = [_convert_outcome(o) for o in raw.get("outcomes", [])]
    
    return UnifiedMarket(
        id=raw.get("id"),
        title=raw.get("title"),
        outcomes=outcomes,
        volume_24h=raw.get("volume24h", 0),
        liquidity=raw.get("liquidity", 0),
        url=raw.get("url"),
        description=raw.get("description"),
        resolution_date=None,  # TODO: Parse if present
        volume=raw.get("volume"),
        open_interest=raw.get("openInterest"),
        image=raw.get("image"),
        category=raw.get("category"),
        tags=raw.get("tags"),
        yes=_convert_outcome(raw["yes"]) if raw.get("yes") else None,
        no=_convert_outcome(raw["no"]) if raw.get("no") else None,
        up=_convert_outcome(raw["up"]) if raw.get("up") else None,
        down=_convert_outcome(raw["down"]) if raw.get("down") else None,
    )


def _convert_event(raw: Dict[str, Any]) -> UnifiedEvent:
    """Convert raw API response to UnifiedEvent."""
    markets = [_convert_market(m) for m in raw.get("markets", [])]
    
    return UnifiedEvent(
        id=raw.get("id"),
        title=raw.get("title"),
        description=raw.get("description"),
        slug=raw.get("slug"),
        markets=markets,
        url=raw.get("url"),
        image=raw.get("image"),
        category=raw.get("category"),
        tags=raw.get("tags"),
    )


def _convert_candle(raw: Dict[str, Any]) -> PriceCandle:
    """Convert raw API response to PriceCandle."""
    return PriceCandle(
        timestamp=raw.get("timestamp"),
        open=raw.get("open"),
        high=raw.get("high"),
        low=raw.get("low"),
        close=raw.get("close"),
        volume=raw.get("volume"),
    )


def _convert_order_book(raw: Dict[str, Any]) -> OrderBook:
    """Convert raw API response to OrderBook."""
    bids = [OrderLevel(price=b.get("price"), size=b.get("size")) for b in raw.get("bids", [])]
    asks = [OrderLevel(price=a.get("price"), size=a.get("size")) for a in raw.get("asks", [])]
    
    return OrderBook(
        bids=bids,
        asks=asks,
        timestamp=raw.get("timestamp"),
    )


def _convert_trade(raw: Dict[str, Any]) -> Trade:
    """Convert raw API response to Trade."""
    return Trade(
        id=raw.get("id"),
        timestamp=raw.get("timestamp"),
        price=raw.get("price"),
        amount=raw.get("amount"),
        side=raw.get("side", "unknown"),
    )


def _convert_order(raw: Dict[str, Any]) -> Order:
    """Convert raw API response to Order."""
    return Order(
        id=raw.get("id"),
        market_id=raw.get("marketId"),
        outcome_id=raw.get("outcomeId"),
        side=raw.get("side"),
        type=raw.get("type"),
        amount=raw.get("amount"),
        status=raw.get("status"),
        filled=raw.get("filled"),
        remaining=raw.get("remaining"),
        timestamp=raw.get("timestamp"),
        price=raw.get("price"),
        fee=raw.get("fee"),
    )


def _convert_position(raw: Dict[str, Any]) -> Position:
    """Convert raw API response to Position."""
    return Position(
        market_id=raw.get("marketId"),
        outcome_id=raw.get("outcomeId"),
        outcome_label=raw.get("outcomeLabel"),
        size=raw.get("size"),
        entry_price=raw.get("entryPrice"),
        current_price=raw.get("currentPrice"),
        unrealized_pnl=raw.get("unrealizedPnL"),
        realized_pnl=raw.get("realizedPnL"),
    )


def _convert_balance(raw: Dict[str, Any]) -> Balance:
    """Convert raw API response to Balance."""
    return Balance(
        currency=raw.get("currency"),
        total=raw.get("total"),
        available=raw.get("available"),
        locked=raw.get("locked"),
    )


def _convert_execution_result(raw: Dict[str, Any]) -> ExecutionPriceResult:
    """Convert raw API response to ExecutionPriceResult."""
    return ExecutionPriceResult(
        price=raw.get("price", 0),
        filled_amount=raw.get("filledAmount", 0),
        fully_filled=raw.get("fullyFilled", False),
    )


class Exchange(ABC):
    """
    Base class for prediction market exchanges.
    
    This provides a unified interface for interacting with different
    prediction market platforms (Polymarket, Kalshi, etc.).
    """
    
    def __init__(
        self,
        exchange_name: str,
        api_key: Optional[str] = None,
        private_key: Optional[str] = None,
        base_url: str = "http://localhost:3847",
        auto_start_server: bool = True,
        proxy_address: Optional[str] = None,
        signature_type: Optional[Any] = None,
    ):
        """
        Initialize an exchange client.
        
        Args:
            exchange_name: Name of the exchange ("polymarket" or "kalshi")
            api_key: API key for authentication (optional)
            private_key: Private key for authentication (optional)
            base_url: Base URL of the PMXT sidecar server
            auto_start_server: Automatically start server if not running (default: True)
        """
        self.exchange_name = exchange_name.lower()
        self.api_key = api_key
        self.private_key = private_key
        self.proxy_address = proxy_address
        self.signature_type = signature_type
        
        # Initialize server manager
        self._server_manager = ServerManager(base_url)
        
        # Ensure server is running (unless disabled)
        if auto_start_server:
            try:
                self._server_manager.ensure_server_running()
                
                # Get the actual port the server is running on
                # (may differ from default if default port was busy)
                actual_port = self._server_manager.get_running_port()
                base_url = f"http://localhost:{actual_port}"
                
            except Exception as e:
                raise Exception(
                    f"Failed to start PMXT server: {e}\n\n"
                    f"Please ensure 'pmxtjs' is installed: npm install -g pmxtjs\n"
                    f"Or start the server manually: pmxt-server"
                )
        
        # Configure the API client with the actual base URL
        config = Configuration(host=base_url)
        self._api_client = ApiClient(configuration=config)
        
        # Add access token from lock file
        server_info = self._server_manager.get_server_info()
        if server_info and 'accessToken' in server_info:
            self._api_client.default_headers['x-pmxt-access-token'] = server_info['accessToken']
            
        self._api = DefaultApi(api_client=self._api_client)
    
    def close(self):
        """No-op for now, kept for API compatibility with TS."""
        pass
    
    def _handle_response(self, response: Dict[str, Any]) -> Any:
        """Handle API response and extract data."""
        if not response.get("success"):
            error = response.get("error", {})
            if isinstance(error, str):
                raise Exception(error)
            raise Exception(error.get("message", "Unknown error"))
        return response.get("data")
    
    def _get_credentials_dict(self) -> Optional[Dict[str, Any]]:
        """Build credentials dictionary for API requests."""
        if not self.api_key and not self.private_key:
            return None
        
        creds = {}
        if self.api_key:
            creds["apiKey"] = self.api_key
        if self.private_key:
            creds["privateKey"] = self.private_key
        if self.proxy_address:
            creds["funderAddress"] = self.proxy_address
        if self.signature_type is not None:
            creds["signatureType"] = self.signature_type
        return creds if creds else None
    
    # Market Data Methods
    
    def fetch_markets(self, params: Optional[MarketFilterParams] = None) -> List[UnifiedMarket]:
        """
        Get active markets from the exchange.
        
        Args:
            params: Optional filter parameters
            
        Returns:
            List of unified markets
            
        Example:
            >>> markets = exchange.fetch_markets(MarketFilterParams(limit=20, sort="volume"))
        """
        try:
            body_dict = {"args": []}
            if params:
                body_dict["args"] = [params.__dict__]
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.FetchMarketsRequest.from_dict(body_dict)
            
            response = self._api.fetch_markets(
                exchange=self.exchange_name,
                fetch_markets_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_market(m) for m in data]
        except ApiException as e:
            raise Exception(f"Failed to fetch markets: {e}")
    
    def search_markets(
        self,
        query: str,
        params: Optional[MarketFilterParams] = None,
    ) -> List[UnifiedMarket]:
        """
        Search markets by keyword.
        
        Args:
            query: Search query
            params: Optional filter parameters
            
        Returns:
            List of matching markets
            
        Example:
            >>> markets = exchange.search_markets("Trump", MarketFilterParams(limit=10))
        """
        try:
            args = [query]
            if params:
                args.append(params.__dict__)
            
            body_dict = {"args": args}
            request_body = internal_models.SearchMarketsRequest.from_dict(body_dict)
            
            response = self._api.search_markets(
                exchange=self.exchange_name,
                search_markets_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_market(m) for m in data]
        except ApiException as e:
            raise Exception(f"Failed to search markets: {e}")

    def search_events(
        self,
        query: str,
        params: Optional[MarketFilterParams] = None,
    ) -> List[UnifiedEvent]:
        """
        Search events (groups of related markets) by keyword.
        
        Args:
            query: Search query
            params: Optional filter parameters
            
        Returns:
            List of matching events
            
        Example:
            >>> events = exchange.search_events("Trump")
        """
        try:
            # Manual implementation since generated client is missing this
            params_dict = params.__dict__ if params else None
            
            args = [query]
            if params_dict:
                args.append(params_dict)
                
            body = {"args": args}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            
            # Use raw api_client since generated method is missing
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/searchEvents"
            
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._api_client.default_headers)
            
            response = self._api_client.call_api(
                method="POST",
                url=url,
                body=body,
                header_params=headers
            )
            
            response.read()
            import json
            data_json = json.loads(response.data)
            
            data = self._handle_response(data_json)
            return [_convert_event(e) for e in data]
        except Exception as e:
            raise Exception(f"Failed to search events: {e}")
    
    def get_markets_by_slug(self, slug: str) -> List[UnifiedMarket]:
        """
        Fetch markets by URL slug/ticker.
        
        Args:
            slug: Market slug (Polymarket) or ticker (Kalshi)
            
        Returns:
            List of matching markets
            
        Example:
            >>> # Polymarket
            >>> markets = poly.get_markets_by_slug("who-will-trump-nominate-as-fed-chair")
            >>> 
            >>> # Kalshi
            >>> markets = kalshi.get_markets_by_slug("KXFEDCHAIRNOM-29")
        """
        try:
            body_dict = {"args": [slug]}
            request_body = internal_models.GetMarketsBySlugRequest.from_dict(body_dict)
            
            response = self._api.get_markets_by_slug(
                exchange=self.exchange_name,
                get_markets_by_slug_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_market(m) for m in data]
        except ApiException as e:
            raise Exception(f"Failed to get markets by slug: {e}")
    
    def fetch_ohlcv(
        self,
        outcome_id: str,
        params: HistoryFilterParams,
    ) -> List[PriceCandle]:
        """
        Get historical price candles.
        
        **CRITICAL**: Use outcome.id, not market.id.
        - Polymarket: outcome.id is the CLOB Token ID
        - Kalshi: outcome.id is the Market Ticker
        
        Args:
            outcome_id: Outcome ID (from market.outcomes[].id)
            params: History filter parameters
            
        Returns:
            List of price candles
            
        Example:
            >>> markets = exchange.search_markets("Trump")
            >>> outcome_id = markets[0].outcomes[0].id
            >>> candles = exchange.fetch_ohlcv(
            ...     outcome_id,
            ...     HistoryFilterParams(resolution="1h", limit=100)
            ... )
        """
        try:
            params_dict = {"resolution": params.resolution}
            if params.start:
                params_dict["start"] = params.start.isoformat()
            if params.end:
                params_dict["end"] = params.end.isoformat()
            if params.limit:
                params_dict["limit"] = params.limit
            
            request_body_dict = {"args": [outcome_id, params_dict]}
            request_body = internal_models.FetchOHLCVRequest.from_dict(request_body_dict)
            
            response = self._api.fetch_ohlcv(
                exchange=self.exchange_name,
                fetch_ohlcv_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_candle(c) for c in data]
        except ApiException as e:
            raise Exception(f"Failed to fetch OHLCV: {e}")
    
    def fetch_order_book(self, outcome_id: str) -> OrderBook:
        """
        Get current order book for an outcome.
        
        Args:
            outcome_id: Outcome ID
            
        Returns:
            Current order book
            
        Example:
            >>> order_book = exchange.fetch_order_book(outcome_id)
            >>> print(f"Best bid: {order_book.bids[0].price}")
            >>> print(f"Best ask: {order_book.asks[0].price}")
        """
        try:
            body_dict = {"args": [outcome_id]}
            request_body = internal_models.FetchOrderBookRequest.from_dict(body_dict)
            
            response = self._api.fetch_order_book(
                exchange=self.exchange_name,
                fetch_order_book_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return _convert_order_book(data)
        except ApiException as e:
            raise Exception(f"Failed to fetch order book: {e}")
    
    def fetch_trades(
        self,
        outcome_id: str,
        params: HistoryFilterParams,
    ) -> List[Trade]:
        """
        Get trade history for an outcome.
        
        Note: Polymarket requires API key.
        
        Args:
            outcome_id: Outcome ID
            params: History filter parameters
            
        Returns:
            List of trades
        """
        try:
            params_dict = {"resolution": params.resolution}
            if params.limit:
                params_dict["limit"] = params.limit
            
            request_body_dict = {"args": [outcome_id, params_dict]}
            request_body = internal_models.FetchTradesRequest.from_dict(request_body_dict)
            
            response = self._api.fetch_trades(
                exchange=self.exchange_name,
                fetch_trades_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_trade(t) for t in data]
        except ApiException as e:
            raise Exception(f"Failed to fetch trades: {e}")
    
    # WebSocket Streaming Methods
    
    def watch_order_book(self, outcome_id: str, limit: Optional[int] = None) -> OrderBook:
        """
        Watch real-time order book updates via WebSocket.
        
        Returns a promise that resolves with the next order book update.
        Call repeatedly in a loop to stream updates (CCXT Pro pattern).
        
        Args:
            outcome_id: Outcome ID to watch
            limit: Optional depth limit for order book
            
        Returns:
            Next order book update
            
        Example:
            >>> # Stream order book updates
            >>> while True:
            ...     order_book = exchange.watch_order_book(outcome_id)
            ...     print(f"Best bid: {order_book.bids[0].price}")
            ...     print(f"Best ask: {order_book.asks[0].price}")
        """
        try:
            args = [outcome_id]
            if limit is not None:
                args.append(limit)
            
            body_dict = {"args": args}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.WatchOrderBookRequest.from_dict(body_dict)
            
            response = self._api.watch_order_book(
                exchange=self.exchange_name,
                watch_order_book_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return _convert_order_book(data)
        except ApiException as e:
            raise Exception(f"Failed to watch order book: {e}")
    
    def watch_trades(
        self,
        outcome_id: str,
        since: Optional[int] = None,
        limit: Optional[int] = None
    ) -> List[Trade]:
        """
        Watch real-time trade updates via WebSocket.
        
        Returns a promise that resolves with the next trade(s).
        Call repeatedly in a loop to stream updates (CCXT Pro pattern).
        
        Args:
            outcome_id: Outcome ID to watch
            since: Optional timestamp to filter trades from
            limit: Optional limit for number of trades
            
        Returns:
            Next trade update(s)
            
        Example:
            >>> # Stream trade updates
            >>> while True:
            ...     trades = exchange.watch_trades(outcome_id)
            ...     for trade in trades:
            ...         print(f"Trade: {trade.price} @ {trade.amount}")
        """
        try:
            args = [outcome_id]
            if since is not None:
                args.append(since)
            if limit is not None:
                args.append(limit)
            
            body_dict = {"args": args}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.WatchTradesRequest.from_dict(body_dict)
            
            response = self._api.watch_trades(
                exchange=self.exchange_name,
                watch_trades_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_trade(t) for t in data]
        except ApiException as e:
            raise Exception(f"Failed to watch trades: {e}")
    
    # Trading Methods (require authentication)
    
    def create_order(self, params: CreateOrderParams) -> Order:
        """
        Create a new order.
        
        Args:
            params: Order parameters
            
        Returns:
            Created order
            
        Example:
            >>> order = exchange.create_order(CreateOrderParams(
            ...     market_id="663583",
            ...     outcome_id="10991849...",
            ...     side="buy",
            ...     type="limit",
            ...     amount=10,
            ...     price=0.55
            ... ))
        """
        try:
            params_dict = {
                "marketId": params.market_id,
                "outcomeId": params.outcome_id,
                "side": params.side,
                "type": params.type,
                "amount": params.amount,
            }
            if params.price is not None:
                params_dict["price"] = params.price
            
            request_body_dict = {"args": [params_dict]}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                request_body_dict["credentials"] = creds
            
            request_body = internal_models.CreateOrderRequest.from_dict(request_body_dict)
            
            response = self._api.create_order(
                exchange=self.exchange_name,
                create_order_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return _convert_order(data)
        except ApiException as e:
            raise Exception(f"Failed to create order: {e}")
    
    def cancel_order(self, order_id: str) -> Order:
        """
        Cancel an open order.
        
        Args:
            order_id: Order ID to cancel
            
        Returns:
            Cancelled order
        """
        try:
            body_dict = {"args": [order_id]}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.CancelOrderRequest.from_dict(body_dict)
            
            response = self._api.cancel_order(
                exchange=self.exchange_name,
                cancel_order_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return _convert_order(data)
        except ApiException as e:
            raise Exception(f"Failed to cancel order: {e}")
    
    def fetch_order(self, order_id: str) -> Order:
        """
        Get details of a specific order.
        
        Args:
            order_id: Order ID
            
        Returns:
            Order details
        """
        try:
            body_dict = {"args": [order_id]}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.FetchOrderRequest.from_dict(body_dict)
            
            response = self._api.fetch_order(
                exchange=self.exchange_name,
                fetch_order_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return _convert_order(data)
        except ApiException as e:
            raise Exception(f"Failed to fetch order: {e}")
    
    def fetch_open_orders(self, market_id: Optional[str] = None) -> List[Order]:
        """
        Get all open orders, optionally filtered by market.
        
        Args:
            market_id: Optional market ID to filter by
            
        Returns:
            List of open orders
        """
        try:
            args = []
            if market_id:
                args.append(market_id)
            
            body_dict = {"args": args}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.FetchOpenOrdersRequest.from_dict(body_dict)
            
            response = self._api.fetch_open_orders(
                exchange=self.exchange_name,
                fetch_open_orders_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_order(o) for o in data]
        except ApiException as e:
            raise Exception(f"Failed to fetch open orders: {e}")
    
    # Account Methods
    
    def fetch_positions(self) -> List[Position]:
        """
        Get current positions across all markets.
        
        Returns:
            List of positions
        """
        try:
            body_dict = {"args": []}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.FetchPositionsRequest.from_dict(body_dict)
            
            response = self._api.fetch_positions(
                exchange=self.exchange_name,
                fetch_positions_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_position(p) for p in data]
        except ApiException as e:
            raise Exception(f"Failed to fetch positions: {e}")
    
    def fetch_balance(self) -> List[Balance]:
        """
        Get account balance.
        
        Returns:
            List of balances (by currency)
        """
        try:
            body_dict = {"args": []}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            # Note: Generator name for this request might be reused from FetchPositionsRequest
            # if the schemas are identical (empty args array)
            request_body = internal_models.FetchPositionsRequest.from_dict(body_dict)
            
            response = self._api.fetch_balance(
                exchange=self.exchange_name,
                fetch_positions_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_balance(b) for b in data]
        except ApiException as e:
            raise Exception(f"Failed to fetch balance: {e}")

    def get_execution_price(
        self,
        order_book: OrderBook,
        side: Literal["buy", "sell"],
        amount: float
    ) -> float:
        """
        Calculate the average execution price for a given amount.
        
        Args:
            order_book: The current order book
            side: "buy" or "sell"
            amount: The amount to execute
            
        Returns:
            The volume-weighted average price, or 0 if insufficient liquidity
        """
        result = self.get_execution_price_detailed(order_book, side, amount)
        return result.price if result.fully_filled else 0

    def get_execution_price_detailed(
        self,
        order_book: OrderBook,
        side: Literal["buy", "sell"],
        amount: float
    ) -> ExecutionPriceResult:
        """
        Calculate detailed execution price information.
        
        Args:
            order_book: The current order book
            side: "buy" or "sell"
            amount: The amount to execute
            
        Returns:
            Detailed execution result
        """
        try:
            # Convert order_book to dict for API call
            bids = [{"price": b.price, "size": b.size} for b in order_book.bids]
            asks = [{"price": a.price, "size": a.size} for a in order_book.asks]
            ob_dict = {"bids": bids, "asks": asks, "timestamp": order_book.timestamp}

            body = {
                "args": [ob_dict, side, amount]
            }
            
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
                
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/getExecutionPriceDetailed"
            
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._api_client.default_headers)
            
            response = self._api_client.call_api(
                method="POST",
                url=url,
                body=body,
                header_params=headers
            )
            
            response.read()
            data_json = json.loads(response.data)
            
            data = self._handle_response(data_json)
            return _convert_execution_result(data)
        except Exception as e:
            raise Exception(f"Failed to get execution price: {e}")


class Polymarket(Exchange):
    """
    Polymarket exchange client.
    
    Example:
        >>> # Public data (no auth)
        >>> poly = Polymarket()
        >>> markets = poly.search_markets("Trump")
        >>> 
        >>> # Trading (requires auth)
        >>> poly = Polymarket(private_key=os.getenv("POLYMARKET_PRIVATE_KEY"))
        >>> balance = poly.fetch_balance()
    """
    
    def __init__(
        self,
        private_key: Optional[str] = None,
        base_url: str = "http://localhost:3847",
        auto_start_server: bool = True,
        proxy_address: Optional[str] = None,
        signature_type: Optional[Any] = None,
    ):
        """
        Initialize Polymarket client.
        
        Args:
            private_key: Polygon private key (required for trading)
            base_url: Base URL of the PMXT sidecar server
            auto_start_server: Automatically start server if not running (default: True)
            proxy_address: Optional Polymarket Proxy/Smart Wallet address
            signature_type: Optional signature type (0=EOA, 1=Proxy)
        """
        super().__init__(
            exchange_name="polymarket",
            private_key=private_key,
            base_url=base_url,
            auto_start_server=auto_start_server,
            proxy_address=proxy_address,
            signature_type=signature_type,
        )


class Kalshi(Exchange):
    """
    Kalshi exchange client.
    
    Example:
        >>> # Public data (no auth)
        >>> kalshi = Kalshi()
        >>> markets = kalshi.search_markets("Fed rates")
        >>> 
        >>> # Trading (requires auth)
        >>> kalshi = Kalshi(
        ...     api_key=os.getenv("KALSHI_API_KEY"),
        ...     private_key=os.getenv("KALSHI_PRIVATE_KEY")
        ... )
        >>> balance = kalshi.fetch_balance()
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        private_key: Optional[str] = None,
        base_url: str = "http://localhost:3847",
        auto_start_server: bool = True,
    ):
        """
        Initialize Kalshi client.
        
        Args:
            api_key: Kalshi API key (required for trading)
            private_key: Kalshi private key (required for trading)
            base_url: Base URL of the PMXT sidecar server
            auto_start_server: Automatically start server if not running (default: True)
        """
        super().__init__(
            exchange_name="kalshi",
            api_key=api_key,
            private_key=private_key,
            base_url=base_url,
            auto_start_server=auto_start_server,
        )


class Limitless(Exchange):
    """
    Limitless exchange client.
    
    Example:
        >>> # Public data (no auth)
        >>> limitless = Limitless()
        >>> markets = limitless.search_markets("Trump")
        >>> 
        >>> # Trading (requires auth)
        >>> limitless = Limitless(private_key=os.getenv("LIMITLESS_PRIVATE_KEY"))
        >>> balance = limitless.fetch_balance()
    """
    
    def __init__(
        self,
        private_key: Optional[str] = None,
        base_url: str = "http://localhost:3847",
        auto_start_server: bool = True,
    ):
        """
        Initialize Limitless client.
        
        Args:
            private_key: Ethereum private key (required for trading)
            base_url: Base URL of the PMXT sidecar server
            auto_start_server: Automatically start server if not running (default: True)
        """
        super().__init__(
            exchange_name="limitless",
            private_key=private_key,
            base_url=base_url,
            auto_start_server=auto_start_server,
        )
