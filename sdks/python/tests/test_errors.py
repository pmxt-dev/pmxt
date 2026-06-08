from pmxt.errors import (
    EventNotFound,
    ExchangeNotAvailable,
    MarketNotFound,
    NetworkError,
    OrderNotFound,
    RateLimitExceeded,
)


def test_not_found_errors_format_their_messages():
    assert str(OrderNotFound("abc-123")) == "Order not found: abc-123"
    assert str(MarketNotFound("mkt-456")) == "Market not found: mkt-456"
    assert str(EventNotFound("evt-789")) == "Event not found: evt-789"


def test_retryable_errors_are_marked_retryable():
    assert NetworkError("network down").retryable is True
    assert ExchangeNotAvailable("venue offline").retryable is True


def test_rate_limit_retry_after_accepts_float_values():
    err = RateLimitExceeded("slow down", retry_after=1.5)
    assert err.retry_after == 1.5
