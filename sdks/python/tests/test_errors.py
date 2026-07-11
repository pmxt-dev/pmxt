import pytest

from pmxt.errors import (
    AuthenticationError,
    BadRequest,
    EventNotFound,
    ExchangeNotAvailable,
    InsufficientFunds,
    InvalidOrder,
    MarketNotFound,
    NetworkError,
    NotFoundError,
    NotSupported,
    OrderNotFound,
    PermissionDenied,
    PmxtError,
    RateLimitExceeded,
    ValidationError,
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


@pytest.mark.parametrize(
    ("error_type", "expected_code"),
    [
        (BadRequest, "BAD_REQUEST"),
        (AuthenticationError, "AUTHENTICATION_ERROR"),
        (PermissionDenied, "PERMISSION_DENIED"),
        (NotFoundError, "NOT_FOUND"),
        (RateLimitExceeded, "RATE_LIMIT_EXCEEDED"),
        (InvalidOrder, "INVALID_ORDER"),
        (InsufficientFunds, "INSUFFICIENT_FUNDS"),
        (ValidationError, "VALIDATION_ERROR"),
        (NotSupported, "NOT_SUPPORTED"),
    ],
)
def test_directly_raised_errors_use_specific_default_codes(error_type, expected_code):
    assert error_type("test").code == expected_code


@pytest.mark.parametrize("error_type", [PmxtError, BadRequest, OrderNotFound])
def test_errors_expose_their_concrete_class_name(error_type):
    err = error_type("test")
    assert err.name == error_type.__name__


def test_explicit_server_error_metadata_overrides_defaults():
    err = ValidationError("test", code="CUSTOM", retryable=True, exchange="venue")
    assert (err.code, err.retryable, err.exchange) == ("CUSTOM", True, "venue")
