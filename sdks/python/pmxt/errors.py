"""
Typed error classes for pmxt.

These mirror the error hierarchy in the core TypeScript library,
enabling users to catch specific error types.
"""

from __future__ import annotations

from typing import Dict, Any


class PmxtError(Exception):
    """Base error class for all pmxt errors."""

    def __init__(self, message: str, code: str = "UNKNOWN_ERROR", retryable: bool = False, exchange: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.retryable = retryable
        self.exchange = exchange

    def __str__(self) -> str:
        parts = [self.message]
        if self.exchange:
            parts.append(f"[{self.exchange}]")
        return " ".join(parts)


# 4xx Client Errors

def _format_not_found_message(prefix: str, identifier: str) -> str:
    return identifier if identifier.startswith(prefix) else f"{prefix}{identifier}"


class BadRequest(PmxtError):
    """400 Bad Request - The request was malformed or contains invalid parameters."""
    pass


class AuthenticationError(PmxtError):
    """401 Unauthorized - Authentication credentials are missing or invalid."""
    pass


class PermissionDenied(PmxtError):
    """403 Forbidden - The authenticated user doesn't have permission."""
    pass


class NotFoundError(PmxtError):
    """404 Not Found - The requested resource doesn't exist."""
    pass


class OrderNotFound(NotFoundError):
    """404 Not Found - The requested order doesn't exist."""
    def __init__(self, order_id: str, exchange: str | None = None, **_ignored: Any):
        super().__init__(
            _format_not_found_message("Order not found: ", order_id),
            code="ORDER_NOT_FOUND",
            exchange=exchange,
        )


class MarketNotFound(NotFoundError):
    """404 Not Found - The requested market doesn't exist."""
    def __init__(self, market_id: str, exchange: str | None = None, **_ignored: Any):
        super().__init__(
            _format_not_found_message("Market not found: ", market_id),
            code="MARKET_NOT_FOUND",
            exchange=exchange,
        )


class EventNotFound(NotFoundError):
    """404 Not Found - The requested event doesn't exist."""
    def __init__(self, identifier: str, exchange: str | None = None, **_ignored: Any):
        super().__init__(
            _format_not_found_message("Event not found: ", identifier),
            code="EVENT_NOT_FOUND",
            exchange=exchange,
        )


class RateLimitExceeded(PmxtError):
    """429 Too Many Requests - Rate limit exceeded."""

    def __init__(self, message: str, retry_after: float | None = None, **kwargs) -> None:
        super().__init__(message, **kwargs)
        self.retry_after = retry_after


class InvalidOrder(PmxtError):
    """400 Bad Request - The order parameters are invalid."""
    pass


class InsufficientFunds(PmxtError):
    """400 Bad Request - Insufficient funds to complete the operation."""
    pass


class ValidationError(PmxtError):
    """400 Bad Request - Input validation failed."""

    def __init__(self, message: str, field: str | None = None, **kwargs) -> None:
        super().__init__(message, **kwargs)
        self.field = field


# 5xx Server/Network Errors

class NetworkError(PmxtError):
    """503 Service Unavailable - Network connectivity issues."""

    def __init__(self, message: str, exchange: str | None = None, **kwargs: Any) -> None:
        kwargs.setdefault("code", "NETWORK_ERROR")
        kwargs.setdefault("retryable", True)
        super().__init__(message, exchange=exchange, **kwargs)


class ExchangeNotAvailable(PmxtError):
    """503 Service Unavailable - Exchange is down or unreachable."""

    def __init__(self, message: str, exchange: str | None = None, **kwargs: Any) -> None:
        kwargs.setdefault("code", "EXCHANGE_NOT_AVAILABLE")
        kwargs.setdefault("retryable", True)
        super().__init__(message, exchange=exchange, **kwargs)


# Mapping from server error codes to error classes
_ERROR_CODE_MAP: dict[str, type[PmxtError]] = {
    "BAD_REQUEST": BadRequest,
    "AUTHENTICATION_ERROR": AuthenticationError,
    "PERMISSION_DENIED": PermissionDenied,
    "NOT_FOUND": NotFoundError,
    "ORDER_NOT_FOUND": OrderNotFound,
    "MARKET_NOT_FOUND": MarketNotFound,
    "EVENT_NOT_FOUND": EventNotFound,
    "RATE_LIMIT_EXCEEDED": RateLimitExceeded,
    "INVALID_ORDER": InvalidOrder,
    "INSUFFICIENT_FUNDS": InsufficientFunds,
    "VALIDATION_ERROR": ValidationError,
    "NETWORK_ERROR": NetworkError,
    "EXCHANGE_NOT_AVAILABLE": ExchangeNotAvailable,
}


def from_server_error(error_data: Dict[str, Any]) -> PmxtError:
    """Convert a server error response dict into a typed PmxtError."""
    if isinstance(error_data, str):
        return PmxtError(error_data)

    message = error_data.get("message", "Unknown error")
    code = error_data.get("code", "UNKNOWN_ERROR")
    retryable = error_data.get("retryable", False)
    exchange = error_data.get("exchange")

    error_class = _ERROR_CODE_MAP.get(code, PmxtError)

    kwargs = {"code": code, "retryable": retryable, "exchange": exchange}

    if error_class == RateLimitExceeded:
        kwargs["retry_after"] = error_data.get("retryAfter")
    elif error_class == ValidationError:
        kwargs["field"] = error_data.get("field")

    return error_class(message, **kwargs)


class NotSupported(PmxtError):
    """The requested operation is not supported."""
    pass


_HOSTED_ERROR_EXPORTS = frozenset(
    {
        "HostedTradingError",
        "InsufficientEscrowBalance",
        "OrderSizeTooSmall",
        "InvalidApiKey",
        "OutcomeNotFound",
        "CatalogUnavailable",
        "BuiltOrderExpired",
        "InvalidSignature",
        "NoLiquidity",
        "MissingWalletAddress",
    }
)


def __getattr__(name: str) -> Any:
    """Lazily re-export hosted errors without creating an import cycle."""
    if name in _HOSTED_ERROR_EXPORTS:
        from . import _hosted_errors
        return getattr(_hosted_errors, name)
