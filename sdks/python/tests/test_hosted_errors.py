import httpx
import pytest

from pmxt._hosted_errors import (
    BuiltOrderExpired,
    CatalogUnavailable,
    HostedTradingError,
    InsufficientEscrowBalance,
    InvalidApiKey,
    InvalidSignature,
    NoLiquidity,
    OrderSizeTooSmall,
    OutcomeNotFound,
    raise_from_response,
)
from pmxt.errors import (
    AuthenticationError,
    ExchangeNotAvailable,
    InsufficientFunds,
    InvalidOrder,
    NotFoundError,
    PmxtError,
)


def _response(status_code, json_body=None, text_body=""):
    request = httpx.Request("POST", "https://trade.pmxt.dev/v0/test")
    if json_body is not None:
        return httpx.Response(status_code, json=json_body, request=request)
    return httpx.Response(status_code, text=text_body, request=request)


_PATTERN_CASES = [
    pytest.param(
        400,
        {"detail": "Insufficient escrow balance: available 1, required 5"},
        "",
        InsufficientEscrowBalance,
        id="insufficient-escrow-balance",
    ),
    pytest.param(
        400,
        {"detail": "order size below the minimum"},
        "",
        OrderSizeTooSmall,
        id="order-size-too-small",
    ),
    pytest.param(
        401,
        None,
        "unauthorized",
        InvalidApiKey,
        id="invalid-api-key-status",
    ),
    pytest.param(
        404,
        {"detail": "catalog: no outcome for token abc"},
        "",
        OutcomeNotFound,
        id="outcome-not-found",
    ),
    pytest.param(
        503,
        {"detail": "catalog: database unavailable"},
        "",
        CatalogUnavailable,
        id="catalog-unavailable",
    ),
    pytest.param(
        404,
        {"detail": "built_order_id expired or unknown"},
        "",
        BuiltOrderExpired,
        id="built-order-expired",
    ),
    pytest.param(
        404,
        {"detail": "cancel_id expired or unknown"},
        "",
        BuiltOrderExpired,
        id="cancel-id-expired",
    ),
    pytest.param(
        200,
        {"error": "Invalid signature"},
        "",
        InvalidSignature,
        id="invalid-signature-200-body",
    ),
    pytest.param(
        400,
        {"detail": "book has no resting asks"},
        "",
        NoLiquidity,
        id="no-resting-asks",
    ),
    pytest.param(
        400,
        None,
        "book has no resting bids",
        NoLiquidity,
        id="no-resting-bids-text",
    ),
    pytest.param(
        502,
        None,
        "upstream returned a new hosted trading error",
        HostedTradingError,
        id="unknown-text-fallback",
    ),
]


@pytest.mark.parametrize(
    ("status_code", "json_body", "text_body", "expected_class"),
    _PATTERN_CASES,
)
def test_raise_from_response_maps_upstream_patterns(
    status_code,
    json_body,
    text_body,
    expected_class,
):
    response = _response(status_code, json_body=json_body, text_body=text_body)

    with pytest.raises(expected_class) as excinfo:
        raise_from_response(response)

    assert type(excinfo.value) is expected_class


@pytest.mark.parametrize(
    ("status_code", "json_body", "text_body", "legacy_base", "expected_class"),
    [
        pytest.param(
            400,
            {"detail": "Insufficient escrow balance: available 1, required 5"},
            "",
            InsufficientFunds,
            InsufficientEscrowBalance,
            id="insufficient-funds-catches-escrow-balance",
        ),
        pytest.param(
            400,
            {"detail": "order size below the minimum"},
            "",
            InvalidOrder,
            OrderSizeTooSmall,
            id="invalid-order-catches-small-order",
        ),
        pytest.param(
            401,
            None,
            "unauthorized",
            AuthenticationError,
            InvalidApiKey,
            id="authentication-error-catches-invalid-api-key",
        ),
        pytest.param(
            404,
            {"detail": "catalog: no outcome for token abc"},
            "",
            NotFoundError,
            OutcomeNotFound,
            id="not-found-catches-outcome-not-found",
        ),
        pytest.param(
            503,
            {"detail": "catalog: database unavailable"},
            "",
            ExchangeNotAvailable,
            CatalogUnavailable,
            id="exchange-not-available-catches-catalog-unavailable",
        ),
        pytest.param(
            404,
            {"detail": "built_order_id expired or unknown"},
            "",
            InvalidOrder,
            BuiltOrderExpired,
            id="invalid-order-catches-built-order-expired",
        ),
        pytest.param(
            200,
            {"error": "Invalid signature"},
            "",
            AuthenticationError,
            InvalidSignature,
            id="authentication-error-catches-invalid-signature",
        ),
        pytest.param(
            400,
            None,
            "book has no resting bids",
            InvalidOrder,
            NoLiquidity,
            id="invalid-order-catches-no-liquidity",
        ),
    ],
)
def test_hosted_errors_are_caught_by_existing_base_classes(
    status_code,
    json_body,
    text_body,
    legacy_base,
    expected_class,
):
    response = _response(status_code, json_body=json_body, text_body=text_body)

    with pytest.raises(legacy_base) as excinfo:
        raise_from_response(response)

    assert type(excinfo.value) is expected_class


def test_unknown_pattern_falls_back_to_hosted_root_and_pmxt_error():
    response = _response(
        502,
        text_body="upstream returned a new hosted trading error",
    )

    with pytest.raises(PmxtError) as excinfo:
        raise_from_response(response)

    assert type(excinfo.value) is HostedTradingError


@pytest.mark.parametrize(
    ("error_class", "legacy_base"),
    [
        pytest.param(
            InsufficientEscrowBalance,
            InsufficientFunds,
            id="insufficient-escrow-balance",
        ),
        pytest.param(OrderSizeTooSmall, InvalidOrder, id="order-size-too-small"),
        pytest.param(InvalidApiKey, AuthenticationError, id="invalid-api-key"),
        pytest.param(OutcomeNotFound, NotFoundError, id="outcome-not-found"),
        pytest.param(
            CatalogUnavailable,
            ExchangeNotAvailable,
            id="catalog-unavailable",
        ),
        pytest.param(BuiltOrderExpired, InvalidOrder, id="built-order-expired"),
        pytest.param(
            InvalidSignature, AuthenticationError, id="invalid-signature",
        ),
        pytest.param(NoLiquidity, InvalidOrder, id="no-liquidity"),
    ],
)
def test_hosted_exceptions_also_catch_as_legacy_base(error_class, legacy_base):
    """Multi-inheritance: existing ``except <legacy_base>`` catches the
    hosted-mode subclass without modification, and ``except HostedTradingError``
    also catches it."""

    assert issubclass(error_class, legacy_base)
    assert issubclass(error_class, HostedTradingError)
    assert issubclass(error_class, PmxtError)
