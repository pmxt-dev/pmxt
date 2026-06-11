"""Hosted trading v0 response mappers.

The hosted trading API exposes explicit ``/v0/*`` JSON shapes.  These helpers
translate those wire dictionaries to the SDK dataclasses without relying on the
legacy sidecar's camelCase auto-mapper.
"""

from __future__ import annotations

import dataclasses as _dc
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Mapping, TypeVar

from .errors import InvalidOrder
from .models import Balance, BuiltOrder, Order, Position, UserTrade

SIX_DEC_SCALE = 1_000_000

_T = TypeVar("_T")


def to_6dec(amount: float | str | Decimal) -> int:
    """Convert a decimal amount to integer micro-units with no rounding."""
    d = Decimal(str(amount))
    scaled = d * SIX_DEC_SCALE
    if scaled != scaled.to_integral_value():
        raise InvalidOrder(f"amount precision exceeds 6 decimals: {amount!r}")
    return int(scaled)


def order_from_v0(payload: Mapping[str, Any] | Any) -> Order:
    """Map an ``OrderV0`` JSON object to :class:`pmxt.models.Order`."""
    data = _as_dict(payload)
    values = {
        "id": str(data["id"]),
        "market_id": _str_or_none(data.get("market_id")),
        "outcome_id": _str_or_none(data.get("outcome_id")),
        "side": data.get("side"),
        "type": data.get("type"),
        "amount": _float_or_none(data.get("amount")),
        "status": str(data["status"]),
        "filled": _float_or_zero(data.get("filled")),
        "remaining": _float_or_zero(data.get("remaining")),
        "timestamp": _timestamp_to_ms(data.get("timestamp")),
        "price": _float_or_none(data.get("price")),
        "fee": _float_or_none(data.get("fee")),
        "tx_hash": data.get("tx_hash"),
        "chain": data.get("chain"),
        "block_number": data.get("block_number"),
        "raw": _raw_or_none(data.get("raw")),
    }
    return _construct(Order, values)


def order_to_v0(order: Order | Mapping[str, Any]) -> dict[str, Any]:
    """Map :class:`pmxt.models.Order` back to an ``OrderV0`` JSON object."""
    data = _as_dict(order)
    out = {
        "id": _str_or_none(data.get("id")),
        "market_id": _str_or_none(data.get("market_id")),
        "outcome_id": _str_or_none(data.get("outcome_id")),
        "side": data.get("side"),
        "type": data.get("type"),
        "amount": _float_or_none(data.get("amount")),
        "price": _float_or_none(data.get("price")),
        "filled": _float_or_zero(data.get("filled")),
        "remaining": _float_or_zero(data.get("remaining")),
        "status": data.get("status"),
        "fee": _float_or_none(data.get("fee")),
        "timestamp": _ms_to_timestamp(data.get("timestamp")),
    }
    _copy_if_present(out, data, "tx_hash")
    _copy_if_present(out, data, "chain")
    _copy_if_present(out, data, "block_number")
    _copy_if_present(out, data, "raw")
    return out


def user_trade_from_v0(payload: Mapping[str, Any] | Any) -> UserTrade:
    """Map a ``UserTradeV0`` JSON object to :class:`pmxt.models.UserTrade`."""
    data = _as_dict(payload)
    raw_amount = _float_or_none(data.get("amount"))
    values = {
        "id": _str_or_none(data.get("id")),
        "timestamp": _timestamp_to_ms(data.get("timestamp")),
        "price": _float_or_none(data.get("price")),
        # The v0 wire sends trade amounts in 6-dec micro-shares (verified
        # live: 58139533.0 == 58.139533 shares, matching the same position's
        # decimal ``shares``). Normalize so UserTrade.amount means shares,
        # like everywhere else in the SDK.
        "amount": raw_amount / 1_000_000 if raw_amount is not None else None,
        "side": data.get("side") or "unknown",
        "order_id": _str_or_none(data.get("order_id")),
        "market_id": _str_or_none(data.get("market_id")),
        "outcome_id": _str_or_none(data.get("outcome_id")),
        "fee": _float_or_none(data.get("fee")),
        "tx_hash": data.get("tx_hash"),
        "chain": data.get("chain"),
        "venue": data.get("venue"),
        "raw": _raw_or_none(data.get("raw")),
    }
    return _construct(UserTrade, values)


def user_trade_to_v0(trade: UserTrade | Mapping[str, Any]) -> dict[str, Any]:
    """Map :class:`pmxt.models.UserTrade` back to a ``UserTradeV0`` object."""
    data = _as_dict(trade)
    decimal_amount = _float_or_none(data.get("amount"))
    out = {
        "id": _str_or_none(data.get("id")),
        "market_id": _str_or_none(data.get("market_id")),
        "outcome_id": _str_or_none(data.get("outcome_id")),
        "side": data.get("side"),
        # Inverse of user_trade_from_v0: decimal shares -> 6-dec micro-shares.
        "amount": round(decimal_amount * 1_000_000) if decimal_amount is not None else None,
        "price": _float_or_none(data.get("price")),
        "fee": _float_or_none(data.get("fee")),
        "timestamp": _ms_to_timestamp(data.get("timestamp")),
    }
    _copy_if_present(out, data, "tx_hash")
    _copy_if_present(out, data, "chain")
    _copy_if_present(out, data, "venue")
    _copy_if_present(out, data, "raw")
    return out


def position_from_v0(payload: Mapping[str, Any] | Any) -> Position:
    """Map a ``PositionV0`` JSON object to :class:`pmxt.models.Position`."""
    data = _as_dict(payload)
    size = _float_value(data["shares"])
    entry_price = _float_or_none(data.get("entry_price"))
    current_price = _float_or_none(data.get("current_price"))
    unrealized_pnl = _float_or_none(data.get("unrealized_pnl"))
    if (
        unrealized_pnl is None
        and size is not None
        and entry_price is not None
        and current_price is not None
    ):
        unrealized_pnl = (current_price - entry_price) * size
    values = {
        "market_id": _str_or_none(data.get("market_id")),
        "outcome_id": _str_or_none(data.get("outcome_id")),
        "outcome_label": _str_or_none(data.get("outcome_label")),
        "size": size,
        "entry_price": entry_price,
        "current_price": current_price,
        "unrealized_pnl": unrealized_pnl,
        "realized_pnl": _float_or_none(data.get("realized_pnl")),
        "venue": data.get("venue"),
        "current_value": _float_or_none(data.get("current_value")),
        "raw": _raw_or_none(data.get("raw")),
    }
    return _construct(Position, values)


def position_to_v0(position: Position | Mapping[str, Any]) -> dict[str, Any]:
    """Map :class:`pmxt.models.Position` back to a ``PositionV0`` object."""
    data = _as_dict(position)
    out = {
        "market_id": _str_or_none(data.get("market_id")),
        "outcome_id": _str_or_none(data.get("outcome_id")),
        "venue": data.get("venue"),
        "shares": _float_value(data["size"]),
        "current_price": _float_or_none(data.get("current_price")),
        "current_value": _float_or_none(data.get("current_value")),
        "outcome_label": _str_or_none(data.get("outcome_label")),
        "entry_price": _float_or_none(data.get("entry_price")),
        "unrealized_pnl": _float_or_none(data.get("unrealized_pnl")),
        "realized_pnl": _float_or_none(data.get("realized_pnl")),
    }
    _copy_if_present(out, data, "raw")
    return out


def balance_from_v0(payload: Mapping[str, Any] | Any) -> Balance:
    """Map a ``BalanceV0`` JSON object to :class:`pmxt.models.Balance`."""
    data = _as_dict(payload)
    total = _float_value(data["amount"])
    values = {
        "currency": str(data.get("currency") or "USDC"),
        "total": total,
        "available": total,
        "locked": 0.0,
        "venue": data.get("venue"),
    }
    return _construct(Balance, values)


def balance_to_v0(balance: Balance | Mapping[str, Any]) -> dict[str, Any]:
    """Map :class:`pmxt.models.Balance` back to a ``BalanceV0`` object."""
    data = _as_dict(balance)
    out = {
        "currency": str(data.get("currency") or "USDC"),
        "amount": _float_value(data["total"]),
    }
    _copy_if_present(out, data, "venue")
    return out


def built_order_from_v0(payload: Mapping[str, Any] | Any) -> BuiltOrder:
    """Map a ``BuildOrderV0Resp`` JSON object to :class:`pmxt.models.BuiltOrder`."""
    data = _as_dict(payload)
    raw = dict(data)
    resolved = _mapping_or_none(data.get("resolved"))
    params = {
        "built_order_id": data.get("built_order_id"),
        "side": data.get("side"),
        "quote": _mapping_or_none(data.get("quote")),
        "resolved": resolved,
    }
    exchange = str(data.get("exchange") or (resolved or {}).get("venue") or "hosted")
    return BuiltOrder(
        exchange=exchange,
        params=params,
        raw=raw,
        signed_order=None,
        tx=None,
    )


def built_order_to_v0(built: BuiltOrder | Mapping[str, Any]) -> dict[str, Any]:
    """Map :class:`pmxt.models.BuiltOrder` back to ``BuildOrderV0Resp`` JSON."""
    data = _as_dict(built)
    raw = _mapping_or_none(data.get("raw"))
    if raw is not None and "built_order_id" in raw:
        return raw

    params = _mapping_or_none(data.get("params")) or {}
    out = {
        "built_order_id": params.get("built_order_id") or data.get("built_order_id"),
        "side": params.get("side") or data.get("side"),
        "typed_data": params.get("typed_data") or data.get("typed_data"),
        "pull_typed_data": params.get("pull_typed_data") or data.get("pull_typed_data"),
        "quote": params.get("quote") or data.get("quote"),
        "resolved": params.get("resolved") or data.get("resolved"),
    }
    return out


order_v0_to_sdk = order_from_v0
sdk_order_to_v0 = order_to_v0
user_trade_v0_to_sdk = user_trade_from_v0
sdk_user_trade_to_v0 = user_trade_to_v0
position_v0_to_sdk = position_from_v0
sdk_position_to_v0 = position_to_v0
balance_v0_to_sdk = balance_from_v0
sdk_balance_to_v0 = balance_to_v0
built_order_v0_to_sdk = built_order_from_v0
sdk_built_order_to_v0 = built_order_to_v0


def _str_or_none(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value or None
    return str(value)


def _float_or_none(value: Any) -> float | None:
    return _float_value(value)


def _float_or_zero(value: Any) -> float:
    converted = _float_value(value)
    return converted if converted is not None else 0.0


def _raw_or_none(value: Any) -> Any | None:
    if value is None:
        return None
    if isinstance(value, Mapping):
        return dict(value)
    if isinstance(value, list):
        return list(value)
    return value


def _mapping_or_none(value: Any) -> dict[str, Any] | None:
    return dict(value) if isinstance(value, Mapping) else None


def _copy_if_present(out: dict[str, Any], data: Mapping[str, Any], key: str) -> None:
    if key in data and data[key] is not None:
        out[key] = data[key]


def _float_value(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, str):
        if not value:
            return None
        return float(value)
    raise TypeError(f"unsupported numeric type: {type(value).__name__}")


def _construct(model: type[_T], values: Mapping[str, Any]) -> _T:
    if not _dc.is_dataclass(model):
        return model(**values)
    field_names = {field.name for field in _dc.fields(model)}
    kwargs = {key: value for key, value in values.items() if key in field_names}
    return model(**kwargs)


def _as_dict(value: Mapping[str, Any] | Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        return dict(model_dump(mode="json", exclude_none=False))
    legacy_dict = getattr(value, "dict", None)
    if callable(legacy_dict):
        return dict(legacy_dict())
    if _dc.is_dataclass(value):
        return _dc.asdict(value)
    raise TypeError(f"expected mapping, pydantic model, or dataclass; got {type(value).__name__}")


def _timestamp_to_ms(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, (int, float)):
        return int(value)
    elif isinstance(value, str):
        if not value:
            return 0
        normalized = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
    else:
        raise TypeError(f"unsupported timestamp type: {type(value).__name__}")

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _ms_to_timestamp(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    dt = datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")

