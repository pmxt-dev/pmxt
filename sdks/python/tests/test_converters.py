"""
Unit tests for the Python SDK converter functions.

Each converter is tested against a raw camelCase dict that exercises every
field of the target dataclass so that mapping gaps are immediately visible
rather than silently defaulting to None.

The converter functions are module-private but importable directly.
No mocking of external dependencies is required — the converters are pure
functions that transform dicts into dataclasses.
"""

import pytest
from datetime import datetime, timezone

from pmxt.client import (
    _convert_market,
    _convert_event,
    _convert_outcome,
    _convert_order_book,
    _convert_candle,
    _convert_trade,
    _convert_user_trade,
    _convert_order,
    _convert_subscription_snapshot,
)
from pmxt.models import (
    UnifiedMarket,
    UnifiedEvent,
    MarketOutcome,
    OrderBook,
    OrderLevel,
    PriceCandle,
    Trade,
    UserTrade,
    Order,
    MarketList,
    SubscribedAddressSnapshot,
)


# ---------------------------------------------------------------------------
# Shared raw-dict builders
# ---------------------------------------------------------------------------

def _raw_outcome(
    outcome_id: str = "outcome-abc-123",
    label: str = "Yes",
    price: float = 0.72,
    price_change_24h: float = 0.05,
    metadata: dict = None,
    market_id: str = "market-xyz-999",
    best_bid: float = None,
    best_ask: float = None,
) -> dict:
    raw = {
        "outcomeId": outcome_id,
        "label": label,
        "price": price,
        "priceChange24h": price_change_24h,
        "metadata": metadata or {"exchange_token": "tok_001"},
        "marketId": market_id,
    }
    if best_bid is not None:
        raw["bestBid"] = best_bid
    if best_ask is not None:
        raw["bestAsk"] = best_ask
    return raw


def _raw_market(
    market_id: str = "market-xyz-999",
    title: str = "Will BTC reach $100k by end of 2025?",
    volume_24h: float = 123456.78,
    liquidity: float = 999000.00,
    url: str = "https://polymarket.com/event/btc-100k",
    description: str = "This market resolves YES if BTC closes above $100,000.",
    resolution_date: str = "2025-12-31T23:59:59Z",
    volume: float = 9876543.21,
    open_interest: float = 55000.00,
    image: str = "https://cdn.pmxt.dev/btc.png",
    category: str = "Crypto",
    tags: list = None,
    slug: str = "btc-100k-2025",
    tick_size: float = 0.01,
    status: str = "active",
    contract_address: str = "0xdeadbeef1234567890abcdef",
    source_exchange: str = "polymarket",
    event_id: str = "event-parent-001",
    outcomes: list = None,
    yes: dict = None,
    no: dict = None,
) -> dict:
    raw = {
        "marketId": market_id,
        "title": title,
        "volume24h": volume_24h,
        "liquidity": liquidity,
        "url": url,
        "description": description,
        "resolutionDate": resolution_date,
        "volume": volume,
        "openInterest": open_interest,
        "image": image,
        "category": category,
        "tags": tags or ["crypto", "bitcoin"],
        "slug": slug,
        "tickSize": tick_size,
        "status": status,
        "contractAddress": contract_address,
        "sourceExchange": source_exchange,
        "eventId": event_id,
        "outcomes": outcomes or [
            _raw_outcome(outcome_id="yes-tok", label="Yes", price=0.72),
            _raw_outcome(outcome_id="no-tok", label="No", price=0.28),
        ],
    }
    if yes is not None:
        raw["yes"] = yes
    if no is not None:
        raw["no"] = no
    return raw


def _raw_event(
    id: str = "event-parent-001",
    title: str = "Bitcoin Price Milestones 2025",
    description: str = "A collection of BTC price prediction markets.",
    slug: str = "btc-price-2025",
    url: str = "https://polymarket.com/events/btc-price-2025",
    image: str = "https://cdn.pmxt.dev/btc-event.png",
    category: str = "Crypto",
    tags: list = None,
    volume_24h: float = 555111.22,
    volume: float = 12345678.90,
    source_exchange: str = "polymarket",
    markets: list = None,
) -> dict:
    return {
        "id": id,
        "title": title,
        "description": description,
        "slug": slug,
        "url": url,
        "image": image,
        "category": category,
        "tags": tags or ["crypto", "btc"],
        "volume24h": volume_24h,
        "volume": volume,
        "sourceExchange": source_exchange,
        "markets": markets or [_raw_market()],
    }


# ---------------------------------------------------------------------------
# _convert_outcome
# ---------------------------------------------------------------------------

class TestConvertOutcome:

    def test_all_fields_mapped(self):
        raw = _raw_outcome()
        outcome = _convert_outcome(raw)

        assert outcome.outcome_id == "outcome-abc-123"
        assert outcome.label == "Yes"
        assert outcome.price == 0.72
        assert outcome.price_change_24h == 0.05
        assert outcome.metadata == {"exchange_token": "tok_001"}
        assert outcome.market_id == "market-xyz-999"

    def test_returns_market_outcome_instance(self):
        outcome = _convert_outcome(_raw_outcome())
        assert isinstance(outcome, MarketOutcome)

    def test_price_uses_last_price_when_no_bid_ask(self):
        raw = _raw_outcome(price=0.65)
        outcome = _convert_outcome(raw)
        assert outcome.price == 0.65

    def test_price_uses_midpoint_when_tight_spread(self):
        # spread = 0.73 - 0.67 = 0.06, which is < 0.10 => midpoint
        raw = _raw_outcome(price=0.60, best_bid=0.67, best_ask=0.73)
        outcome = _convert_outcome(raw)
        assert outcome.price == pytest.approx(0.70, abs=1e-9)

    def test_price_uses_last_when_wide_spread(self):
        # spread = 0.80 - 0.60 = 0.20, which is >= 0.10 => last price
        raw = _raw_outcome(price=0.55, best_bid=0.60, best_ask=0.80)
        outcome = _convert_outcome(raw)
        assert outcome.price == 0.55

    def test_best_bid_ask_stored(self):
        raw = _raw_outcome(best_bid=0.67, best_ask=0.73)
        outcome = _convert_outcome(raw)
        assert outcome.best_bid == 0.67
        assert outcome.best_ask == 0.73

    def test_best_bid_ask_none_when_absent(self):
        raw = _raw_outcome()  # no bestBid / bestAsk keys
        outcome = _convert_outcome(raw)
        assert outcome.best_bid is None
        assert outcome.best_ask is None

    def test_price_change_24h_none_when_absent(self):
        raw = {"outcomeId": "tok-1", "label": "No", "price": 0.28}
        outcome = _convert_outcome(raw)
        assert outcome.price_change_24h is None

    def test_metadata_none_when_absent(self):
        raw = {"outcomeId": "tok-1", "label": "No", "price": 0.28}
        outcome = _convert_outcome(raw)
        assert outcome.metadata is None

    def test_spread_exactly_at_threshold_uses_last_price(self):
        # spread = 0.10 exactly is NOT < 0.10 => last price
        raw = _raw_outcome(price=0.50, best_bid=0.45, best_ask=0.55)
        outcome = _convert_outcome(raw)
        assert outcome.price == 0.50

    def test_spread_just_below_threshold_uses_midpoint(self):
        # spread = 0.099 < 0.10 => midpoint
        raw = _raw_outcome(price=0.50, best_bid=0.451, best_ask=0.550)
        outcome = _convert_outcome(raw)
        assert outcome.price == pytest.approx((0.451 + 0.550) / 2, abs=1e-9)


# ---------------------------------------------------------------------------
# _convert_market
# ---------------------------------------------------------------------------

class TestConvertMarket:

    def test_all_required_fields_mapped(self):
        raw = _raw_market()
        market = _convert_market(raw)

        assert market.market_id == "market-xyz-999"
        assert market.title == "Will BTC reach $100k by end of 2025?"
        assert market.url == "https://polymarket.com/event/btc-100k"
        assert market.volume_24h == 123456.78
        assert market.liquidity == 999000.00

    def test_all_optional_fields_mapped(self):
        raw = _raw_market()
        market = _convert_market(raw)

        assert market.description == "This market resolves YES if BTC closes above $100,000."
        assert market.volume == 9876543.21
        assert market.open_interest == 55000.00
        assert market.image == "https://cdn.pmxt.dev/btc.png"
        assert market.category == "Crypto"
        assert market.tags == ["crypto", "bitcoin"]
        assert market.slug == "btc-100k-2025"
        assert market.tick_size == 0.01
        assert market.status == "active"
        assert market.contract_address == "0xdeadbeef1234567890abcdef"
        assert market.source_exchange == "polymarket"
        assert market.event_id == "event-parent-001"

    def test_returns_unified_market_instance(self):
        market = _convert_market(_raw_market())
        assert isinstance(market, UnifiedMarket)

    def test_resolution_date_parsed_from_iso_string(self):
        raw = _raw_market(resolution_date="2025-12-31T23:59:59Z")
        market = _convert_market(raw)

        assert isinstance(market.resolution_date, datetime)
        assert market.resolution_date.year == 2025
        assert market.resolution_date.month == 12
        assert market.resolution_date.day == 31
        assert market.resolution_date.hour == 23
        assert market.resolution_date.minute == 59
        assert market.resolution_date.second == 59

    def test_resolution_date_timezone_aware(self):
        raw = _raw_market(resolution_date="2025-06-15T12:00:00Z")
        market = _convert_market(raw)
        assert market.resolution_date.tzinfo is not None

    def test_resolution_date_none_when_absent(self):
        raw = _raw_market()
        del raw["resolutionDate"]
        market = _convert_market(raw)
        assert market.resolution_date is None

    def test_resolution_date_none_for_invalid_string(self):
        raw = _raw_market(resolution_date="not-a-date")
        market = _convert_market(raw)
        assert market.resolution_date is None

    def test_resolution_date_passthrough_when_already_datetime(self):
        dt = datetime(2025, 9, 1, 0, 0, 0, tzinfo=timezone.utc)
        raw = _raw_market()
        raw["resolutionDate"] = dt
        market = _convert_market(raw)
        assert market.resolution_date is dt

    def test_outcomes_are_list_of_market_outcome(self):
        raw = _raw_market()
        market = _convert_market(raw)

        assert len(market.outcomes) == 2
        for outcome in market.outcomes:
            assert isinstance(outcome, MarketOutcome)

    def test_outcomes_preserve_fields(self):
        raw = _raw_market()
        raw["outcomes"] = [
            _raw_outcome(outcome_id="yes-tok", label="Yes", price=0.72, price_change_24h=0.03),
            _raw_outcome(outcome_id="no-tok", label="No", price=0.28, price_change_24h=-0.03),
        ]
        market = _convert_market(raw)

        yes_outcome = market.outcomes[0]
        assert yes_outcome.outcome_id == "yes-tok"
        assert yes_outcome.label == "Yes"
        assert yes_outcome.price == 0.72
        assert yes_outcome.price_change_24h == 0.03

        no_outcome = market.outcomes[1]
        assert no_outcome.outcome_id == "no-tok"
        assert no_outcome.label == "No"
        assert no_outcome.price == 0.28
        assert no_outcome.price_change_24h == -0.03

    def test_yes_no_convenience_fields_are_market_outcome(self):
        raw = _raw_market(
            yes=_raw_outcome(outcome_id="yes-tok", label="Yes", price=0.75),
            no=_raw_outcome(outcome_id="no-tok", label="No", price=0.25),
        )
        market = _convert_market(raw)

        assert isinstance(market.yes, MarketOutcome)
        assert market.yes.outcome_id == "yes-tok"
        assert market.yes.label == "Yes"
        assert market.yes.price == 0.75

        assert isinstance(market.no, MarketOutcome)
        assert market.no.outcome_id == "no-tok"
        assert market.no.label == "No"
        assert market.no.price == 0.25

    def test_up_down_convenience_fields_are_market_outcome(self):
        raw = _raw_market()
        raw["up"] = _raw_outcome(outcome_id="up-tok", label="Up", price=0.60)
        raw["down"] = _raw_outcome(outcome_id="down-tok", label="Down", price=0.40)
        market = _convert_market(raw)

        assert isinstance(market.up, MarketOutcome)
        assert market.up.outcome_id == "up-tok"
        assert market.up.label == "Up"
        assert market.up.price == 0.60

        assert isinstance(market.down, MarketOutcome)
        assert market.down.outcome_id == "down-tok"
        assert market.down.label == "Down"
        assert market.down.price == 0.40

    def test_yes_no_up_down_none_when_absent(self):
        raw = _raw_market()
        market = _convert_market(raw)
        assert market.yes is None
        assert market.no is None
        assert market.up is None
        assert market.down is None

    def test_volume_24h_defaults_to_zero_when_absent(self):
        raw = _raw_market()
        del raw["volume24h"]
        market = _convert_market(raw)
        assert market.volume_24h == 0

    def test_liquidity_defaults_to_zero_when_absent(self):
        raw = _raw_market()
        del raw["liquidity"]
        market = _convert_market(raw)
        assert market.liquidity == 0

    def test_outcomes_empty_list_when_absent(self):
        raw = _raw_market()
        del raw["outcomes"]
        market = _convert_market(raw)
        assert market.outcomes == []

    def test_question_property_is_alias_for_title(self):
        raw = _raw_market(title="Will ETH flip BTC?")
        market = _convert_market(raw)
        assert market.question == "Will ETH flip BTC?"

    def test_distinct_values_are_not_confused(self):
        # Each field has a distinct value — ensures no field bleed between mappings.
        raw = _raw_market(
            market_id="MARKET-001",
            title="TITLE-002",
            url="https://example.com/URL-003",
            description="DESC-004",
            volume_24h=1.0,
            liquidity=2.0,
            volume=3.0,
            open_interest=4.0,
            image="https://example.com/IMG-005",
            category="CAT-006",
            tags=["TAG-007"],
            slug="SLUG-008",
            tick_size=0.001,
            status="STATUS-009",
            contract_address="ADDR-010",
            source_exchange="EXCHANGE-011",
            event_id="EVENT-012",
        )
        market = _convert_market(raw)
        assert market.market_id == "MARKET-001"
        assert market.title == "TITLE-002"
        assert market.url == "https://example.com/URL-003"
        assert market.description == "DESC-004"
        assert market.volume_24h == 1.0
        assert market.liquidity == 2.0
        assert market.volume == 3.0
        assert market.open_interest == 4.0
        assert market.image == "https://example.com/IMG-005"
        assert market.category == "CAT-006"
        assert market.tags == ["TAG-007"]
        assert market.slug == "SLUG-008"
        assert market.tick_size == 0.001
        assert market.status == "STATUS-009"
        assert market.contract_address == "ADDR-010"
        assert market.source_exchange == "EXCHANGE-011"
        assert market.event_id == "EVENT-012"

    def test_nested_outcome_market_id_field_mapped(self):
        raw = _raw_market()
        raw["outcomes"] = [
            _raw_outcome(outcome_id="tok-1", label="Yes", price=0.5, market_id="market-xyz-999"),
        ]
        market = _convert_market(raw)
        assert market.outcomes[0].market_id == "market-xyz-999"

    def test_nested_outcome_metadata_mapped(self):
        raw = _raw_market()
        raw["outcomes"] = [
            _raw_outcome(metadata={"clob_token_id": "0xabc"}),
        ]
        market = _convert_market(raw)
        assert market.outcomes[0].metadata == {"clob_token_id": "0xabc"}


# ---------------------------------------------------------------------------
# _convert_event
# ---------------------------------------------------------------------------

class TestConvertEvent:

    def test_all_fields_mapped(self):
        raw = _raw_event()
        event = _convert_event(raw)

        assert event.id == "event-parent-001"
        assert event.title == "Bitcoin Price Milestones 2025"
        assert event.description == "A collection of BTC price prediction markets."
        assert event.slug == "btc-price-2025"
        assert event.url == "https://polymarket.com/events/btc-price-2025"
        assert event.image == "https://cdn.pmxt.dev/btc-event.png"
        assert event.category == "Crypto"
        assert event.tags == ["crypto", "btc"]
        assert event.volume_24h == 555111.22
        assert event.volume == 12345678.90
        assert event.source_exchange == "polymarket"

    def test_returns_unified_event_instance(self):
        event = _convert_event(_raw_event())
        assert isinstance(event, UnifiedEvent)

    def test_markets_is_market_list(self):
        event = _convert_event(_raw_event())
        assert isinstance(event.markets, MarketList)

    def test_nested_markets_converted(self):
        raw = _raw_event(markets=[
            _raw_market(),
            _raw_market(market_id="market-zzz-888", title="Second market"),
        ])
        event = _convert_event(raw)

        assert len(event.markets) == 2
        assert isinstance(event.markets[0], UnifiedMarket)
        assert isinstance(event.markets[1], UnifiedMarket)

    def test_nested_market_all_fields_survive(self):
        inner_market = _raw_market(
            market_id="inner-001",
            title="Inner Market Title",
            volume_24h=9999.0,
            liquidity=8888.0,
            url="https://example.com/inner",
            description="Inner description",
            volume=7777.0,
            open_interest=6666.0,
            image="https://example.com/inner.png",
            category="Politics",
            tags=["election"],
            slug="inner-market",
            tick_size=0.001,
            status="closed",
            contract_address="0xinner",
            source_exchange="kalshi",
            event_id="event-parent-001",
        )
        raw = _raw_event(markets=[inner_market])
        event = _convert_event(raw)
        m = event.markets[0]

        assert m.market_id == "inner-001"
        assert m.title == "Inner Market Title"
        assert m.volume_24h == 9999.0
        assert m.liquidity == 8888.0
        assert m.url == "https://example.com/inner"
        assert m.description == "Inner description"
        assert m.volume == 7777.0
        assert m.open_interest == 6666.0
        assert m.image == "https://example.com/inner.png"
        assert m.category == "Politics"
        assert m.tags == ["election"]
        assert m.slug == "inner-market"
        assert m.tick_size == 0.001
        assert m.status == "closed"
        assert m.contract_address == "0xinner"
        assert m.source_exchange == "kalshi"
        assert m.event_id == "event-parent-001"

    def test_markets_empty_list_when_absent(self):
        raw = _raw_event()
        del raw["markets"]
        event = _convert_event(raw)
        assert list(event.markets) == []

    def test_distinct_event_values_not_confused(self):
        raw = _raw_event(
            id="EV-001",
            title="EV-TITLE-002",
            description="EV-DESC-003",
            slug="EV-SLUG-004",
            url="https://example.com/EV-URL-005",
            image="https://example.com/EV-IMG-006",
            category="EV-CAT-007",
            tags=["EV-TAG-008"],
            volume_24h=1.1,
            volume=2.2,
            source_exchange="EV-EXCHANGE-009",
        )
        event = _convert_event(raw)
        assert event.id == "EV-001"
        assert event.title == "EV-TITLE-002"
        assert event.description == "EV-DESC-003"
        assert event.slug == "EV-SLUG-004"
        assert event.url == "https://example.com/EV-URL-005"
        assert event.image == "https://example.com/EV-IMG-006"
        assert event.category == "EV-CAT-007"
        assert event.tags == ["EV-TAG-008"]
        assert event.volume_24h == 1.1
        assert event.volume == 2.2
        assert event.source_exchange == "EV-EXCHANGE-009"


# ---------------------------------------------------------------------------
# _convert_order_book
# ---------------------------------------------------------------------------

class TestConvertOrderBook:

    def test_bids_and_asks_converted(self):
        raw = {
            "bids": [{"price": 0.68, "size": 150.0}, {"price": 0.67, "size": 300.0}],
            "asks": [{"price": 0.71, "size": 200.0}, {"price": 0.72, "size": 400.0}],
            "timestamp": 1700000000000,
        }
        book = _convert_order_book(raw)

        assert isinstance(book, OrderBook)
        assert len(book.bids) == 2
        assert len(book.asks) == 2

    def test_bid_levels_are_order_level_instances(self):
        raw = {"bids": [{"price": 0.68, "size": 150.0}], "asks": []}
        book = _convert_order_book(raw)
        assert isinstance(book.bids[0], OrderLevel)

    def test_ask_levels_are_order_level_instances(self):
        raw = {"bids": [], "asks": [{"price": 0.71, "size": 200.0}]}
        book = _convert_order_book(raw)
        assert isinstance(book.asks[0], OrderLevel)

    def test_bid_price_and_size_mapped(self):
        raw = {"bids": [{"price": 0.68, "size": 150.0}], "asks": []}
        book = _convert_order_book(raw)
        assert book.bids[0].price == 0.68
        assert book.bids[0].size == 150.0

    def test_ask_price_and_size_mapped(self):
        raw = {"bids": [], "asks": [{"price": 0.71, "size": 200.0}]}
        book = _convert_order_book(raw)
        assert book.asks[0].price == 0.71
        assert book.asks[0].size == 200.0

    def test_timestamp_mapped(self):
        raw = {"bids": [], "asks": [], "timestamp": 1700000000000}
        book = _convert_order_book(raw)
        assert book.timestamp == 1700000000000

    def test_timestamp_none_when_absent(self):
        raw = {"bids": [], "asks": []}
        book = _convert_order_book(raw)
        assert book.timestamp is None

    def test_multiple_bid_and_ask_levels(self):
        raw = {
            "bids": [
                {"price": 0.68, "size": 100.0},
                {"price": 0.67, "size": 250.0},
                {"price": 0.65, "size": 500.0},
            ],
            "asks": [
                {"price": 0.71, "size": 120.0},
                {"price": 0.73, "size": 180.0},
            ],
        }
        book = _convert_order_book(raw)
        assert len(book.bids) == 3
        assert len(book.asks) == 2
        assert book.bids[1].price == 0.67
        assert book.bids[2].size == 500.0
        assert book.asks[1].price == 0.73

    def test_empty_book(self):
        raw = {"bids": [], "asks": []}
        book = _convert_order_book(raw)
        assert book.bids == []
        assert book.asks == []


# ---------------------------------------------------------------------------
# _convert_candle
# ---------------------------------------------------------------------------

class TestConvertCandle:

    def test_all_fields_mapped(self):
        raw = {
            "timestamp": 1700000000000,
            "open": 0.60,
            "high": 0.75,
            "low": 0.55,
            "close": 0.72,
            "volume": 4500.0,
        }
        candle = _convert_candle(raw)

        assert isinstance(candle, PriceCandle)
        assert candle.timestamp == 1700000000000
        assert candle.open == 0.60
        assert candle.high == 0.75
        assert candle.low == 0.55
        assert candle.close == 0.72
        assert candle.volume == 4500.0

    def test_volume_none_when_absent(self):
        raw = {
            "timestamp": 1700000000000,
            "open": 0.60,
            "high": 0.75,
            "low": 0.55,
            "close": 0.72,
        }
        candle = _convert_candle(raw)
        assert candle.volume is None

    def test_distinct_ohlcv_values_not_confused(self):
        raw = {
            "timestamp": 9999999999999,
            "open": 0.11,
            "high": 0.99,
            "low": 0.01,
            "close": 0.55,
            "volume": 12345.67,
        }
        candle = _convert_candle(raw)
        assert candle.timestamp == 9999999999999
        assert candle.open == 0.11
        assert candle.high == 0.99
        assert candle.low == 0.01
        assert candle.close == 0.55
        assert candle.volume == 12345.67

    def test_returns_price_candle_instance(self):
        raw = {"timestamp": 1, "open": 0.5, "high": 0.6, "low": 0.4, "close": 0.5}
        assert isinstance(_convert_candle(raw), PriceCandle)


# ---------------------------------------------------------------------------
# _convert_trade
# ---------------------------------------------------------------------------

class TestConvertTrade:

    def test_all_fields_mapped(self):
        raw = {
            "id": "trade-001",
            "timestamp": 1700000000001,
            "price": 0.68,
            "amount": 50.0,
            "side": "buy",
        }
        trade = _convert_trade(raw)

        assert isinstance(trade, Trade)
        assert trade.id == "trade-001"
        assert trade.timestamp == 1700000000001
        assert trade.price == 0.68
        assert trade.amount == 50.0
        assert trade.side == "buy"

    def test_side_sell(self):
        raw = {"id": "t-2", "timestamp": 1, "price": 0.3, "amount": 10.0, "side": "sell"}
        trade = _convert_trade(raw)
        assert trade.side == "sell"

    def test_side_defaults_to_unknown_when_absent(self):
        raw = {"id": "t-3", "timestamp": 1, "price": 0.5, "amount": 5.0}
        trade = _convert_trade(raw)
        assert trade.side == "unknown"

    def test_distinct_field_values(self):
        raw = {
            "id": "TRADE-ID-001",
            "timestamp": 1111111111111,
            "price": 0.33,
            "amount": 77.0,
            "side": "buy",
        }
        trade = _convert_trade(raw)
        assert trade.id == "TRADE-ID-001"
        assert trade.timestamp == 1111111111111
        assert trade.price == 0.33
        assert trade.amount == 77.0


# ---------------------------------------------------------------------------
# _convert_user_trade
# ---------------------------------------------------------------------------

class TestConvertUserTrade:

    def test_all_fields_mapped(self):
        raw = {
            "id": "utrade-001",
            "timestamp": 1700000000002,
            "price": 0.71,
            "amount": 25.0,
            "side": "sell",
            "orderId": "order-abc-789",
        }
        trade = _convert_user_trade(raw)

        assert isinstance(trade, UserTrade)
        assert trade.id == "utrade-001"
        assert trade.timestamp == 1700000000002
        assert trade.price == 0.71
        assert trade.amount == 25.0
        assert trade.side == "sell"
        assert trade.order_id == "order-abc-789"

    def test_is_subclass_of_trade(self):
        raw = {"id": "ut-1", "timestamp": 1, "price": 0.5, "amount": 1.0, "side": "buy"}
        trade = _convert_user_trade(raw)
        assert isinstance(trade, Trade)

    def test_order_id_none_when_absent(self):
        raw = {"id": "ut-2", "timestamp": 1, "price": 0.5, "amount": 1.0, "side": "buy"}
        trade = _convert_user_trade(raw)
        assert trade.order_id is None

    def test_side_defaults_to_unknown_when_absent(self):
        raw = {"id": "ut-3", "timestamp": 1, "price": 0.5, "amount": 1.0}
        trade = _convert_user_trade(raw)
        assert trade.side == "unknown"

    def test_distinct_field_values(self):
        raw = {
            "id": "UTRADE-ID-002",
            "timestamp": 2222222222222,
            "price": 0.88,
            "amount": 44.0,
            "side": "sell",
            "orderId": "ORDER-XYZ-999",
        }
        trade = _convert_user_trade(raw)
        assert trade.id == "UTRADE-ID-002"
        assert trade.timestamp == 2222222222222
        assert trade.price == 0.88
        assert trade.amount == 44.0
        assert trade.side == "sell"
        assert trade.order_id == "ORDER-XYZ-999"


# ---------------------------------------------------------------------------
# _convert_order
# ---------------------------------------------------------------------------

class TestConvertOrder:

    def test_all_required_fields_mapped(self):
        raw = {
            "id": "order-001",
            "marketId": "market-xyz-999",
            "outcomeId": "yes-tok",
            "side": "buy",
            "type": "limit",
            "amount": 100.0,
            "status": "open",
            "filled": 0.0,
            "remaining": 100.0,
            "timestamp": 1700000000003,
            "price": 0.68,
            "fee": 0.25,
        }
        order = _convert_order(raw)

        assert isinstance(order, Order)
        assert order.id == "order-001"
        assert order.market_id == "market-xyz-999"
        assert order.outcome_id == "yes-tok"
        assert order.side == "buy"
        assert order.type == "limit"
        assert order.amount == 100.0
        assert order.status == "open"
        assert order.filled == 0.0
        assert order.remaining == 100.0
        assert order.timestamp == 1700000000003
        assert order.price == 0.68
        assert order.fee == 0.25

    def test_price_none_when_absent(self):
        raw = {
            "id": "o-2",
            "marketId": "m-1",
            "outcomeId": "tok-1",
            "side": "sell",
            "type": "market",
            "amount": 10.0,
            "status": "pending",
            "filled": 0.0,
            "remaining": 10.0,
            "timestamp": 1,
        }
        order = _convert_order(raw)
        assert order.price is None

    def test_fee_none_when_absent(self):
        raw = {
            "id": "o-3",
            "marketId": "m-1",
            "outcomeId": "tok-1",
            "side": "buy",
            "type": "limit",
            "amount": 5.0,
            "status": "filled",
            "filled": 5.0,
            "remaining": 0.0,
            "timestamp": 1,
            "price": 0.5,
        }
        order = _convert_order(raw)
        assert order.fee is None

    def test_side_sell_preserved(self):
        raw = {
            "id": "o-4",
            "marketId": "m-1",
            "outcomeId": "tok-1",
            "side": "sell",
            "type": "limit",
            "amount": 20.0,
            "status": "open",
            "filled": 5.0,
            "remaining": 15.0,
            "timestamp": 1,
            "price": 0.72,
        }
        order = _convert_order(raw)
        assert order.side == "sell"

    def test_distinct_field_values(self):
        raw = {
            "id": "ORDER-001",
            "marketId": "MARKET-002",
            "outcomeId": "OUTCOME-003",
            "side": "buy",
            "type": "limit",
            "amount": 111.0,
            "status": "canceled",
            "filled": 22.0,
            "remaining": 89.0,
            "timestamp": 3333333333333,
            "price": 0.44,
            "fee": 0.11,
        }
        order = _convert_order(raw)
        assert order.id == "ORDER-001"
        assert order.market_id == "MARKET-002"
        assert order.outcome_id == "OUTCOME-003"
        assert order.side == "buy"
        assert order.type == "limit"
        assert order.amount == 111.0
        assert order.status == "canceled"
        assert order.filled == 22.0
        assert order.remaining == 89.0
        assert order.timestamp == 3333333333333
        assert order.price == 0.44
        assert order.fee == 0.11

    def test_partially_filled_order(self):
        raw = {
            "id": "o-5",
            "marketId": "m-2",
            "outcomeId": "tok-2",
            "side": "buy",
            "type": "limit",
            "amount": 50.0,
            "status": "open",
            "filled": 30.0,
            "remaining": 20.0,
            "timestamp": 1,
            "price": 0.65,
        }
        order = _convert_order(raw)
        assert order.filled == 30.0
        assert order.remaining == 20.0
        assert order.amount == 50.0


class TestConvertSubscriptionSnapshot:
    def test_missing_lists_default_to_empty_lists(self):
        snapshot = _convert_subscription_snapshot({
            "address": "0xabc",
            "timestamp": 123,
        })
        assert isinstance(snapshot, SubscribedAddressSnapshot)
        assert snapshot.trades == []
        assert snapshot.positions == []
        assert snapshot.balances == []
