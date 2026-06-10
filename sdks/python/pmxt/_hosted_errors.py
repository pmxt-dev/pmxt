"""Hosted trading error hierarchy and upstream response mapping."""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping, Sequence
from typing import ClassVar, TYPE_CHECKING

from .errors import (
    AuthenticationError,
    ExchangeNotAvailable,
    InsufficientFunds,
    InvalidOrder,
    NotFoundError,
    NotSupported,
    PmxtError,
    ValidationError,
)

if TYPE_CHECKING:
    import httpx


class HostedTradingError(PmxtError):
    """Root error for hosted trading failures returned by trade.pmxt.dev."""

    DEFAULT_CODE: ClassVar[str] = "HOSTED_TRADING_ERROR"
    DEFAULT_RETRYABLE: ClassVar[bool | None] = None

    def __init__(self, status: int | str, detail: str | None = None) -> None:
        status_value = status if isinstance(status, int) else 0
        detail_value = detail if detail is not None else str(status)
        self.status = status_value
        self.detail = detail_value
        retryable = (
            self.DEFAULT_RETRYABLE
            if self.DEFAULT_RETRYABLE is not None
            else status_value >= 500
        )
        super().__init__(detail_value, code=self.DEFAULT_CODE, retryable=retryable)


class InsufficientEscrowBalance(InsufficientFunds, HostedTradingError):
    """Hosted escrow balance is too low for the requested order."""

    DEFAULT_CODE: ClassVar[str] = "INSUFFICIENT_ESCROW_BALANCE"
    __init__ = HostedTradingError.__init__


class OrderSizeTooSmall(InvalidOrder, HostedTradingError):
    """Order amount is below the upstream minimum size."""

    DEFAULT_CODE: ClassVar[str] = "ORDER_SIZE_TOO_SMALL"
    __init__ = HostedTradingError.__init__


class InvalidApiKey(AuthenticationError, HostedTradingError):
    """Hosted PMXT API key is missing, invalid, expired, or revoked."""

    DEFAULT_CODE: ClassVar[str] = "INVALID_API_KEY"
    __init__ = HostedTradingError.__init__


class OutcomeNotFound(NotFoundError, HostedTradingError):
    """The hosted catalog could not resolve the requested outcome."""

    DEFAULT_CODE: ClassVar[str] = "OUTCOME_NOT_FOUND"
    __init__ = HostedTradingError.__init__


class CatalogUnavailable(ExchangeNotAvailable, HostedTradingError):
    """The hosted catalog is temporarily unavailable."""

    DEFAULT_CODE: ClassVar[str] = "CATALOG_UNAVAILABLE"
    DEFAULT_RETRYABLE: ClassVar[bool | None] = True
    __init__ = HostedTradingError.__init__


class BuiltOrderExpired(InvalidOrder, HostedTradingError):
    """The single-use built order or cancellation context has expired."""

    DEFAULT_CODE: ClassVar[str] = "BUILT_ORDER_EXPIRED"
    __init__ = HostedTradingError.__init__


class InvalidSignature(AuthenticationError, HostedTradingError):
    """The hosted trading API rejected a signature or typed-data check."""

    DEFAULT_CODE: ClassVar[str] = "INVALID_SIGNATURE"
    __init__ = HostedTradingError.__init__


class NoLiquidity(InvalidOrder, HostedTradingError):
    """No resting liquidity exists on the requested side of the book."""

    DEFAULT_CODE: ClassVar[str] = "NO_LIQUIDITY"
    __init__ = HostedTradingError.__init__


class MissingWalletAddress(ValidationError):
    """Hosted trading request requires a wallet address before any network call."""


DetailPattern = Callable[[str], bool]
HostedErrorPattern = tuple[int | None, DetailPattern, type[HostedTradingError]]


def _matches_any_detail(_detail: str) -> bool:
    return True


def _matches_insufficient_escrow_balance(detail: str) -> bool:
    return detail.startswith("Insufficient escrow balance")


def _matches_order_size_too_small(detail: str) -> bool:
    return "below the minimum" in detail


def _matches_outcome_not_found(detail: str) -> bool:
    return "catalog: no outcome" in detail


def _matches_catalog_unavailable(detail: str) -> bool:
    return detail.startswith("catalog:")


def _matches_built_order_expired(detail: str) -> bool:
    return "built_order_id expired" in detail or "cancel_id expired" in detail


def _matches_invalid_signature(detail: str) -> bool:
    return "Invalid signature" in detail


def _matches_no_liquidity(detail: str) -> bool:
    return "book has no resting asks" in detail or "book has no resting bids" in detail


HOSTED_ERROR_PATTERNS: list[HostedErrorPattern] = [
    (401, _matches_any_detail, InvalidApiKey),
    (None, _matches_insufficient_escrow_balance, InsufficientEscrowBalance),
    (None, _matches_order_size_too_small, OrderSizeTooSmall),
    (None, _matches_outcome_not_found, OutcomeNotFound),
    (None, _matches_catalog_unavailable, CatalogUnavailable),
    (None, _matches_built_order_expired, BuiltOrderExpired),
    (None, _matches_invalid_signature, InvalidSignature),
    (None, _matches_no_liquidity, NoLiquidity),
]

ERROR_PATTERN_TABLE = HOSTED_ERROR_PATTERNS


def raise_from_response(response: httpx.Response) -> None:
    """Raise the hosted trading exception matching an upstream HTTP response."""

    status = response.status_code
    payload = _json_payload(response)

    if status < 400:
        detail = _error_detail_from_success_payload(payload)
        if detail is None:
            return
    else:
        detail = _detail_from_payload(payload) or _text_detail(response, status)

    for expected_status, detail_pattern, exception_class in HOSTED_ERROR_PATTERNS:
        if _matches_status(expected_status, status) and detail_pattern(detail):
            raise exception_class(status, detail)

    raise HostedTradingError(status, detail)


def _matches_status(expected_status: int | None, status: int) -> bool:
    return expected_status is None or expected_status == status


def _json_payload(response: httpx.Response) -> object | None:
    try:
        return response.json()
    except ValueError:
        return None


def _error_detail_from_success_payload(payload: object | None) -> str | None:
    if not isinstance(payload, Mapping):
        # Lists and scalars on 2xx responses are valid success payloads
        # (e.g. /v0/user/{addr}/balances returns a JSON array). Only the
        # explicit `{"success": false}` / `{"error": ...}` envelope shapes
        # below count as an error on a 2xx status.
        return None

    detail = _stringify_detail(payload.get("error")) or _stringify_detail(payload.get("errors"))
    if detail is not None:
        return detail

    if payload.get("success") is False:
        return _detail_from_payload(payload)

    return None


def _detail_from_payload(payload: object | None) -> str | None:
    if payload is None:
        return None

    if isinstance(payload, Mapping):
        for key in ("detail", "message", "error", "errors"):
            value = payload.get(key)
            text = _stringify_detail(value)
            if text:
                return text
        return None

    return _stringify_detail(payload)


def _stringify_detail(value: object | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, (bytes, bytearray)):
        return value.decode("utf-8", errors="replace").strip() or None
    if isinstance(value, Mapping) or (
        isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray))
    ):
        try:
            text = json.dumps(value, sort_keys=True, default=str)
        except TypeError:
            text = str(value)
        return text.strip() or None
    return str(value).strip() or None


def _text_detail(response: "httpx.Response", status: int) -> str:
    text = getattr(response, "text", "")
    return text.strip() or f"HTTP {status}"
