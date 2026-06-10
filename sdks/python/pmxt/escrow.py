"""Hosted escrow transaction builders for PMXT clients."""

from __future__ import annotations

import math
from decimal import Decimal, InvalidOperation
from typing import TYPE_CHECKING, Any, Literal, cast
from urllib.parse import quote

from ._hosted_errors import MissingWalletAddress
from ._hosted_routing import _trading_request
from .errors import ValidationError

if TYPE_CHECKING:
    from .client import Exchange


_APPROVAL_TOKENS = frozenset({"usdc", "ctf"})
_WITHDRAW_ACTIONS = frozenset({"request", "claim", "cancel"})
_USDC_SCALE = Decimal("1000000")


def _is_decimal_token_id(token: str) -> bool:
    return token.isascii() and token.isdecimal()


def _approval_token(token: str) -> str:
    if not isinstance(token, str):
        raise ValidationError(
            "token must be 'usdc', 'ctf', or a decimal CTF token_id string",
            field="token",
        )

    candidate = token.strip()
    normalized = candidate.lower()
    if normalized in _APPROVAL_TOKENS:
        return normalized
    if _is_decimal_token_id(candidate):
        return candidate
    raise ValidationError(
        "token must be 'usdc', 'ctf', or a decimal CTF token_id string",
        field="token",
    )


def _amount_wei(value: int | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValidationError(
            "amount_wei must be a non-negative integer",
            field="amount_wei",
        )
    if value < 0:
        raise ValidationError("amount_wei must be non-negative", field="amount_wei")
    return value


def _usdc_amount(value: float | Decimal, *, field: str = "amount") -> float:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationError(
            f"{field} must be a finite positive number",
            field=field,
        ) from exc

    if not amount.is_finite():
        raise ValidationError(f"{field} must be a finite positive number", field=field)
    if amount <= 0:
        raise ValidationError(f"{field} must be positive", field=field)

    scaled = amount * _USDC_SCALE
    if scaled != scaled.to_integral_value():
        raise ValidationError(
            f"{field} precision exceeds 6 decimals; max precision for USDC is 0.000001",
            field=field,
        )

    json_amount = float(amount)
    if not math.isfinite(json_amount):
        raise ValidationError(f"{field} is too large to encode as JSON", field=field)
    return json_amount


class Escrow:
    """Hosted escrow namespace attached to hosted exchange clients."""

    __slots__ = ("_client",)

    def __init__(self, client: Exchange) -> None:
        self._client = client

    def _wallet_address(self, address: str | None = None) -> str:
        resolved = address or getattr(self._client, "wallet_address", None)
        if not resolved:
            raise MissingWalletAddress(
                "wallet_address is required; pass wallet_address to the "
                "Exchange constructor"
            )
        return str(resolved)

    def _request(
        self,
        method: Literal["GET", "POST"],
        path: str,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return cast(
            dict[str, Any],
            _trading_request(self._client, method=method, path=path, body=body),
        )

    def approve_tx(self, token: str, amount_wei: int | None = None) -> dict[str, Any]:
        """Build an unsigned approval transaction for USDC or CTF escrow access."""
        address = self._wallet_address()
        approval_amount = _amount_wei(amount_wei)
        body = {
            "token": _approval_token(token),
            "user_address": address,
            **({} if approval_amount is None else {"amount_wei": approval_amount}),
        }
        return self._request("POST", "/v0/escrow/approve", body)

    def deposit_tx(self, amount: float | Decimal) -> dict[str, Any]:
        """Build an unsigned USDC deposit transaction into PreFundedEscrow."""
        body = {
            "token": "usdc",
            "amount": _usdc_amount(amount),
            "user_address": self._wallet_address(),
        }
        return self._request("POST", "/v0/escrow/deposit", body)

    def withdraw_tx(
        self,
        action: Literal["request", "claim", "cancel"],
        amount: float | None = None,
    ) -> dict[str, Any]:
        """Build an unsigned USDC withdrawal request, claim, or cancel transaction."""
        if not isinstance(action, str) or action not in _WITHDRAW_ACTIONS:
            raise ValidationError(
                "action must be 'request', 'claim', or 'cancel'",
                field="action",
            )

        address = self._wallet_address()
        if action == "request":
            if amount is None:
                raise ValidationError(
                    "amount is required when action='request'",
                    field="amount",
                )
            body = {
                "action": action,
                "token": "usdc",
                "amount": _usdc_amount(amount),
                "user_address": address,
            }
            return self._request("POST", "/v0/escrow/withdraw", body)

        if amount is not None:
            raise ValidationError(
                f"amount must be omitted when action='{action}'",
                field="amount",
            )

        body = {"action": action, "token": "usdc", "user_address": address}
        return self._request("POST", "/v0/escrow/withdraw", body)

    def withdrawals(
        self,
        include: str = "pending,events",
        address: str | None = None,
    ) -> dict[str, Any]:
        """Return pending withdrawal state and/or withdrawal events for an address."""
        include_value = include.strip()
        if not include_value:
            raise ValidationError("include must not be empty", field="include")

        wallet_address = quote(self._wallet_address(address), safe="")
        include_query = quote(include_value, safe=",")
        path = f"/v0/escrow/{wallet_address}/withdrawals?include={include_query}"
        return self._request("GET", path)


__all__ = ["Escrow"]
