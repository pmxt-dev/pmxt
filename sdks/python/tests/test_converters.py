"""Unit tests for client converter helpers, with mocked API responses."""

import json
import pytest
from unittest.mock import MagicMock, patch

from pmxt.client import _convert_balance, _convert_market, _convert_order, _convert_position


class TestConvertBalance:
    """Tests for the _convert_balance converter."""

    def test_convert_balance_full(self):
        raw = {"currency": "USDC", "total": 150.5, "available": 100.0, "locked": 50.5}
        result = _convert_balance(raw)
        assert result.currency == "USDC"
        assert result.total == 150.5
        assert result.available == 100.0
        assert result.locked == 50.5

    def test_convert_balance_missing_fields(self):
        raw = {"currency": "USDC"}
        result = _convert_balance(raw)
        assert result.currency == "USDC"
        assert result.total is None
        assert result.available is None
        assert result.locked is None

    def test_convert_balance_empty(self):
        raw = {}
        result = _convert_balance(raw)
        assert result.currency is None


class TestConvertMarket:
    """Tests for the _convert_market converter."""

    def test_convert_market_basic(self):
        raw = {
            "marketId": "abc123",
            "title": "Will it rain tomorrow?",
            "outcomes": [
                {"id": "yes", "price": 0.65},
                {"id": "no", "price": 0.35},
            ],
            "volume24h": 50000,
            "liquidity": 10000,
            "url": "https://polymarket.com/event/abc123",
        }
        result = _convert_market(raw)
        assert result.market_id == "abc123"
        assert result.title == "Will it rain tomorrow?"
        assert len(result.outcomes) == 2
        assert result.volume_24h == 50000


class TestConvertPosition:
    """Tests for the _convert_position converter."""

    def test_convert_position_basic(self):
        raw = {
            "marketId": "m1",
            "outcome": "Yes",
            "size": 50.0,
            "avgPrice": 0.55,
        }
        result = _convert_position(raw)
        assert result.market_id == "m1"
        assert result.size == 50.0
        assert result.avg_price == 0.55


class TestConvertOrder:
    """Tests for the _convert_order converter."""

    def test_convert_order_basic(self):
        raw = {
            "orderId": "o1",
            "marketId": "m1",
            "side": "buy",
            "size": 10.0,
            "filledSize": 5.0,
            "price": 0.6,
            "status": "partial",
        }
        result = _convert_order(raw)
        assert result.order_id == "o1"
        assert result.market_id == "m1"
        assert result.size == 10.0
        assert result.filled_size == 5.0
