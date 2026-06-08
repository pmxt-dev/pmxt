"""
Feed client — CCXT-compatible method names over /api/feeds/* endpoints.

Usage:
    from pmxt.feed_client import FeedClient
    feed = FeedClient('chainlink', pmxt_api_key='...')
    ticker = feed.fetch_ticker('BTC/USD')
"""

import os
import urllib.request
import urllib.parse
import urllib.error
import json
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Tuple


@dataclass(frozen=True)
class Ticker:
    symbol: str
    info: Any
    timestamp: Optional[int] = None
    datetime: Optional[str] = None
    high: Optional[float] = None
    low: Optional[float] = None
    bid: Optional[float] = None
    bid_volume: Optional[float] = None
    ask: Optional[float] = None
    ask_volume: Optional[float] = None
    vwap: Optional[float] = None
    open: Optional[float] = None
    close: Optional[float] = None
    last: Optional[float] = None
    previous_close: Optional[float] = None
    change: Optional[float] = None
    percentage: Optional[float] = None
    average: Optional[float] = None
    quote_volume: Optional[float] = None
    base_volume: Optional[float] = None
    index_price: Optional[float] = None
    mark_price: Optional[float] = None


OHLCV = Tuple[float, float, float, float, float, float]


@dataclass(frozen=True)
class Market:
    id: str
    symbol: str
    base: str
    quote: str
    active: bool
    type: str
    info: Any = field(default_factory=dict)


@dataclass(frozen=True)
class OracleRound:
    feed: str
    round_id: str
    answer: float
    started_at: int
    updated_at: int
    answered_in_round: str
    decimals: int
    description: Optional[str] = None


HOSTED_URL = "https://api.pmxt.dev"
LOCAL_URL = "http://localhost:3847"


def _resolve_base_url(pmxt_api_key: str) -> str:
    env_url = os.environ.get("PMXT_BASE_URL")
    if env_url:
        return env_url
    if pmxt_api_key:
        return HOSTED_URL
    return LOCAL_URL


class FeedClient:
    def __init__(
        self,
        feed_name: str,
        *,
        pmxt_api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> None:
        self._feed_name = feed_name
        api_key = pmxt_api_key or os.environ.get("PMXT_API_KEY", "")
        self._base_url = base_url or _resolve_base_url(api_key)
        self._headers: Dict[str, str] = {}
        if api_key:
            self._headers["Authorization"] = f"Bearer {api_key}"

    def list_feeds(self) -> List[str]:
        return self._request(f"{self._base_url}/api/feeds/")

    def load_markets(self) -> Dict[str, Market]:
        data = self._get("loadMarkets", {})
        return {
            k: Market(
                id=v["id"],
                symbol=v["symbol"],
                base=v["base"],
                quote=v["quote"],
                active=v.get("active", True),
                type=v.get("type", "spot"),
                info=v.get("info", {}),
            )
            for k, v in data.items()
        }

    def fetch_ticker(self, symbol: str) -> Ticker:
        data = self._get("fetchTicker", {"symbol": symbol})
        return self._to_ticker(data)

    def fetch_tickers(self, symbols: Optional[List[str]] = None) -> Dict[str, Ticker]:
        params: Dict[str, Any] = {}
        if symbols:
            params["symbols"] = ",".join(symbols)
        data = self._get("fetchTickers", params)
        return {k: self._to_ticker(v) for k, v in data.items()}

    def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        since: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> List[OHLCV]:
        params: Dict[str, Any] = {"symbol": symbol, "timeframe": timeframe}
        if since is not None:
            params["since"] = since
        if limit is not None:
            params["limit"] = limit
        data = self._get("fetchOHLCV", params)
        return [tuple(row) for row in data]

    def fetch_oracle_round(self, feed: str) -> OracleRound:
        data = self._get("fetchOracleRound", {"feed": feed})
        return self._to_oracle_round(data)

    def fetch_oracle_history(
        self, feed: str, limit: Optional[int] = None
    ) -> List[OracleRound]:
        params: Dict[str, Any] = {"feed": feed}
        if limit is not None:
            params["limit"] = limit
        data = self._get("fetchOracleHistory", params)
        return [self._to_oracle_round(r) for r in data]

    def fetch_historical_prices(
        self,
        symbol: str,
        *,
        from_timestamp: Optional[int] = None,
        until_timestamp: Optional[int] = None,
        max_size: Optional[int] = None,
        order: Optional[str] = None,
    ) -> List[Ticker]:
        params: Dict[str, Any] = {"symbol": symbol}
        if from_timestamp is not None:
            params["fromTimestamp"] = from_timestamp
        if until_timestamp is not None:
            params["untilTimestamp"] = until_timestamp
        if max_size is not None:
            params["maxSize"] = max_size
        if order is not None:
            params["order"] = order
        data = self._get("fetchHistoricalPrices", params)
        return [self._to_ticker(r) for r in data]

    def _get(self, method: str, params: Dict[str, Any]) -> Any:
        url = f"{self._base_url}/api/feeds/{self._feed_name}/{method}"
        return self._request(url, params)

    def _request(self, url: str, params: Optional[Dict[str, Any]] = None) -> Any:
        filtered = {k: v for k, v in (params or {}).items() if v is not None}
        qs = urllib.parse.urlencode(filtered) if filtered else ""
        request_url = f"{url}?{qs}" if qs else url

        req = urllib.request.Request(request_url, headers=self._headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = json.loads(e.read()) if e.fp else {}
            msg = body.get("error", e.reason)
            raise RuntimeError(f"Feed API error ({e.code}): {msg}") from e

        if not body.get("success"):
            raise RuntimeError(f"Feed API error: {body.get('error', 'unknown')}")
        return body["data"]

    @staticmethod
    def _to_ticker(raw: Dict[str, Any]) -> Ticker:
        return Ticker(
            symbol=raw["symbol"],
            info=raw.get("info"),
            timestamp=raw.get("timestamp"),
            datetime=raw.get("datetime"),
            high=raw.get("high"),
            low=raw.get("low"),
            bid=raw.get("bid"),
            bid_volume=raw.get("bidVolume"),
            ask=raw.get("ask"),
            ask_volume=raw.get("askVolume"),
            vwap=raw.get("vwap"),
            open=raw.get("open"),
            close=raw.get("close"),
            last=raw.get("last"),
            previous_close=raw.get("previousClose"),
            change=raw.get("change"),
            percentage=raw.get("percentage"),
            average=raw.get("average"),
            quote_volume=raw.get("quoteVolume"),
            base_volume=raw.get("baseVolume"),
            index_price=raw.get("indexPrice"),
            mark_price=raw.get("markPrice"),
        )

    @staticmethod
    def _to_oracle_round(raw: Dict[str, Any]) -> OracleRound:
        return OracleRound(
            feed=raw["feed"],
            round_id=raw["roundId"],
            answer=raw["answer"],
            started_at=raw["startedAt"],
            updated_at=raw["updatedAt"],
            answered_in_round=raw["answeredInRound"],
            decimals=raw["decimals"],
            description=raw.get("description"),
        )
