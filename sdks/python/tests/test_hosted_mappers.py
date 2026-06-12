from copy import deepcopy
from datetime import datetime
from decimal import Decimal

import pytest

from pmxt import _hosted_mappers
from pmxt.errors import InvalidOrder
from pmxt.models import Balance, Order, Position, UserTrade


def _mapper(*names):
    for name in names:
        mapper = getattr(_hosted_mappers, name, None)
        if callable(mapper):
            return mapper
    raise AssertionError(f"pmxt._hosted_mappers is missing one of: {', '.join(names)}")


map_order_v0 = _mapper("map_order_v0", "order_from_v0", "to_order", "to_sdk_order")
map_position_v0 = _mapper("map_position_v0", "position_from_v0", "to_position", "to_sdk_position")
map_balance_v0 = _mapper("map_balance_v0", "balance_from_v0", "to_balance", "to_sdk_balance")
map_user_trade_v0 = _mapper(
    "map_user_trade_v0",
    "user_trade_from_v0",
    "to_user_trade",
    "to_sdk_user_trade",
)
to_6dec = _hosted_mappers.to_6dec


def _iso_ms(value: str) -> int:
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)


def _order_v0(timestamp="2026-06-08T10:11:12.345Z", outcome_id="outcome-yes"):
    return {
        "id": "order-001",
        "market_id": "market-001",
        "outcome_id": outcome_id,
        "side": "buy",
        "type": "limit",
        "amount": 12.5,
        "price": 0.42,
        "filled": 2.5,
        "remaining": 10.0,
        "status": "open",
        "fee": 0.03,
        "timestamp": timestamp,
        "tx_hash": "0xorder",
        "chain": "polygon",
        "block_number": 123456,
        "raw": {"venue": "polymarket", "token_id": "token-yes"},
    }


def _position_v0(**overrides):
    base = {
        "market_id": "market-002",
        "outcome_id": "outcome-no",
        "venue": "polymarket",
        "shares": 7.25,
        "current_price": 0.64,
        "current_value": 4.64,
        "outcome_label": "No",
        "entry_price": 0.52,
        "realized_pnl": 1.23,
        "raw": {"venue": "polymarket", "token_id": "token-no"},
    }
    return {**base, **overrides}


def _balance_v0():
    return {
        "currency": "USDC",
        "amount": 19.75,
        "venue": "polymarket",
    }


def _user_trade_v0(timestamp="2026-06-08T10:12:13.456Z"):
    return {
        "id": "trade-001",
        "market_id": "market-003",
        "outcome_id": "outcome-yes",
        "side": "sell",
        # Wire amounts are 6-dec micro-shares; the SDK normalizes to decimal.
        "amount": 4_500_000,
        "price": 0.71,
        "fee": 0.02,
        "timestamp": timestamp,
        "tx_hash": "0xtrade",
        "chain": "polygon",
        "venue": "polymarket",
        "raw": {"venue": "polymarket", "token_id": "token-yes"},
    }


class TestHostedOrderMapper:
    def test_order_v0_maps_every_sdk_field_and_metadata(self):
        raw = _order_v0()
        order = map_order_v0(deepcopy(raw))

        assert isinstance(order, Order)
        assert order.id == "order-001"
        assert order.market_id == "market-001"
        assert order.outcome_id == "outcome-yes"
        assert order.side == "buy"
        assert order.type == "limit"
        assert order.amount == 12.5
        assert order.price == 0.42
        assert order.filled == 2.5
        assert order.remaining == 10.0
        assert order.status == "open"
        assert order.fee == 0.03
        assert order.timestamp == _iso_ms("2026-06-08T10:11:12.345Z")
        assert order.tx_hash == "0xorder"
        assert order.chain == "polygon"
        assert order.block_number == 123456
        assert order.raw == {"venue": "polymarket", "token_id": "token-yes"}

    def test_order_null_timestamp_maps_to_zero(self):
        order = map_order_v0(_order_v0(timestamp=None))

        assert order.timestamp == 0


class TestHostedPositionMapper:
    def test_position_v0_renames_shares_to_size_and_maps_enriched_fields(self):
        raw = _position_v0()
        position = map_position_v0(deepcopy(raw))

        assert isinstance(position, Position)
        assert position.market_id == "market-002"
        assert position.outcome_id == "outcome-no"
        assert position.size == 7.25
        assert position.outcome_label == "No"
        assert position.entry_price == 0.52
        assert position.current_price == 0.64
        assert position.realized_pnl == 1.23
        assert position.unrealized_pnl == pytest.approx((0.64 - 0.52) * 7.25)
        assert position.raw == {"venue": "polymarket", "token_id": "token-no"}

    def test_missing_position_enrichment_is_none_not_fabricated_defaults(self):
        raw = {
            "market_id": "market-004",
            "outcome_id": "outcome-maybe",
            "venue": "opinion",
            "shares": 3.0,
            "current_value": 0.0,
            "raw": {"venue": "opinion", "token_id": "token-maybe"},
        }
        position = map_position_v0(deepcopy(raw))

        assert position.market_id == "market-004"
        assert position.outcome_id == "outcome-maybe"
        assert position.size == 3.0
        assert position.outcome_label is None
        assert position.entry_price is None
        assert position.current_price is None
        assert position.realized_pnl is None
        assert position.unrealized_pnl is None
        assert position.raw == {"venue": "opinion", "token_id": "token-maybe"}

    def test_missing_entry_price_keeps_unrealized_pnl_none(self):
        raw = _position_v0(entry_price=None, current_price=0.64)
        position = map_position_v0(raw)

        assert position.current_price == 0.64
        assert position.entry_price is None
        assert position.unrealized_pnl is None

    def test_raw_is_preserved_when_reverse_resolution_misses_outcome_id(self):
        raw = {
            "market_id": "market-missed",
            "outcome_id": None,
            "venue": "polymarket",
            "shares": 2.0,
            "raw": {"venue": "polymarket", "token_id": "token-unresolved"},
        }
        position = map_position_v0(deepcopy(raw))

        assert position.market_id == "market-missed"
        assert position.outcome_id is None
        assert position.size == 2.0
        assert position.raw == {"venue": "polymarket", "token_id": "token-unresolved"}


class TestHostedBalanceMapper:
    def test_balance_v0_renames_amount_to_total_and_sets_hosted_availability(self):
        raw = _balance_v0()
        balance = map_balance_v0(deepcopy(raw))

        assert isinstance(balance, Balance)
        assert balance.currency == "USDC"
        assert balance.total == 19.75
        assert balance.available == 19.75
        assert balance.locked == 0.0


class TestHostedUserTradeMapper:
    def test_user_trade_v0_maps_every_sdk_field_and_metadata(self):
        raw = _user_trade_v0()
        trade = map_user_trade_v0(deepcopy(raw))

        assert isinstance(trade, UserTrade)
        assert trade.id == "trade-001"
        assert trade.market_id == "market-003"
        assert trade.outcome_id == "outcome-yes"
        assert trade.side == "sell"
        assert trade.amount == 4.5
        assert trade.price == 0.71
        assert trade.fee == 0.02
        assert trade.timestamp == _iso_ms("2026-06-08T10:12:13.456Z")
        assert trade.tx_hash == "0xtrade"
        assert trade.chain == "polygon"
        assert trade.venue == "polymarket"
        assert trade.raw == {"venue": "polymarket", "token_id": "token-yes"}


@pytest.mark.parametrize(
    ("amount", "expected"),
    [
        (0.29, 290000),
        (0.1, 100000),
        ("1.2300000", 1230000),
        (Decimal("0.000001"), 1),
        (0, 0),
    ],
)
def test_to_6dec_uses_exact_decimal_grid(amount, expected):
    assert to_6dec(amount) == expected


def test_to_6dec_rejects_sub_micro_precision():
    with pytest.raises(InvalidOrder):
        to_6dec(0.1234567)

