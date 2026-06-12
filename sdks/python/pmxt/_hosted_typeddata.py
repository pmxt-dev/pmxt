"""Hosted trading EIP-712 validation guardrails."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Mapping, Sequence

try:
    from ._hosted_errors import InvalidSignature
except ImportError:  # pragma: no cover - kept so this module imports before phase-0 lands.
    from .errors import AuthenticationError

    class InvalidSignature(AuthenticationError):
        """Fallback until pmxt._hosted_errors is added by the hosted-mode phase."""

try:
    from ._hosted_mappers import to_6dec
except ImportError:  # pragma: no cover - kept so this module imports before phase-0 lands.

    def to_6dec(amount: Any) -> int:
        scaled = Decimal(str(amount)) * Decimal("1000000")
        if scaled != scaled.to_integral_value():
            raise ValueError(f"amount precision exceeds 6 decimals: {amount!r}")
        return int(scaled)

try:
    from .constants import PREFUNDED_ESCROW_ADDRESSES, VENUE_ESCROW_ADDRESSES
except ImportError:  # pragma: no cover - constants are introduced by a parallel phase.
    PREFUNDED_ESCROW_ADDRESSES: tuple[str, ...] = ()
    VENUE_ESCROW_ADDRESSES: tuple[str, ...] = ()


FieldList = tuple[tuple[str, str], ...]
FailFn = Callable[[str], None]

_MISSING = object()
_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
_SIGNATURE_RE = re.compile(r"^0x[0-9a-fA-F]{130}$")
_SIX_DEC_SCALE = Decimal("1000000")
_SECP256K1_N = int(
    "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
    16,
)
_SECP256K1_HALF_N = _SECP256K1_N // 2

EIP712_DOMAIN_FIELDS: FieldList = (
    ("name", "string"),
    ("version", "string"),
    ("chainId", "uint256"),
    ("verifyingContract", "address"),
)

ORDER_PARAMS_FIELDS: FieldList = (
    ("user", "address"),
    ("tokenId", "uint256"),
    ("worstPrice", "uint256"),
    ("maxCostUsdc", "uint256"),
    ("deadline", "uint256"),
    ("nonce", "uint256"),
)

SELL_ORDER_PARAMS_FIELDS: FieldList = (
    ("user", "address"),
    ("tokenId", "uint256"),
    ("tokenAmount", "uint256"),
    ("worstPrice", "uint256"),
    ("deadline", "uint256"),
    ("nonce", "uint256"),
)

CROSS_CHAIN_ORDER_PARAMS_FIELDS: FieldList = (
    ("user", "address"),
    ("tokenId", "uint256"),
    ("maxCostUsdc", "uint256"),
    ("worstPrice", "uint256"),
    ("destEscrow", "address"),
    ("oracleKey", "address"),
    ("deadline", "uint256"),
    ("nonce", "uint256"),
)

CROSS_CHAIN_SELL_PAY_PARAMS_FIELDS: FieldList = (
    ("user", "address"),
    ("tokenId", "uint256"),
    ("tokenAmount", "uint256"),
    ("worstPrice", "uint256"),
    ("deadline", "uint256"),
    ("nonce", "uint256"),
)

CROSS_CHAIN_SELL_PULL_PARAMS_FIELDS: FieldList = (
    ("user", "address"),
    ("tokenId", "uint256"),
    ("tokenAmount", "uint256"),
    ("deadline", "uint256"),
    ("nonce", "uint256"),
)

CANCEL_ORDER_FIELDS: FieldList = (
    ("user", "address"),
    ("path", "uint8"),
    ("nonce", "uint256"),
    ("deadline", "uint256"),
)

CANCEL_PULL_FIELDS: FieldList = (
    ("user", "address"),
    ("nonce", "uint256"),
    ("deadline", "uint256"),
)


@dataclass(frozen=True)
class DomainSchema:
    name: str
    version: str
    chain_id: int
    verifying_contracts: Any


@dataclass(frozen=True)
class TypedDataSchema:
    primary_type: str
    domain: DomainSchema
    fields: FieldList
    message_keys: frozenset[str]
    wallet_field: str = "user"


_PREFUNDED_DOMAIN = DomainSchema(
    name="PreFundedEscrow",
    version="1",
    chain_id=137,
    verifying_contracts=PREFUNDED_ESCROW_ADDRESSES,
)
_VENUE_DOMAIN = DomainSchema(
    name="VenueEscrow",
    version="1",
    chain_id=56,
    verifying_contracts=VENUE_ESCROW_ADDRESSES,
)

SCHEMAS: Mapping[str, TypedDataSchema] = {
    "polymarket_buy": TypedDataSchema(
        primary_type="OrderParams",
        domain=_PREFUNDED_DOMAIN,
        fields=ORDER_PARAMS_FIELDS,
        message_keys=frozenset(name for name, _ in ORDER_PARAMS_FIELDS),
    ),
    "polymarket_sell": TypedDataSchema(
        primary_type="SellOrderParams",
        domain=_PREFUNDED_DOMAIN,
        fields=SELL_ORDER_PARAMS_FIELDS,
        message_keys=frozenset(name for name, _ in SELL_ORDER_PARAMS_FIELDS),
    ),
    "opinion_buy": TypedDataSchema(
        primary_type="CrossChainOrderParams",
        domain=_PREFUNDED_DOMAIN,
        fields=CROSS_CHAIN_ORDER_PARAMS_FIELDS,
        message_keys=frozenset(name for name, _ in CROSS_CHAIN_ORDER_PARAMS_FIELDS),
    ),
    "opinion_sell_polygon": TypedDataSchema(
        primary_type="CrossChainSellPayParams",
        domain=_PREFUNDED_DOMAIN,
        fields=CROSS_CHAIN_SELL_PAY_PARAMS_FIELDS,
        message_keys=frozenset(name for name, _ in CROSS_CHAIN_SELL_PAY_PARAMS_FIELDS),
    ),
    "opinion_sell_bsc_pull": TypedDataSchema(
        primary_type="CrossChainSellPullParams",
        domain=_VENUE_DOMAIN,
        fields=CROSS_CHAIN_SELL_PULL_PARAMS_FIELDS,
        message_keys=frozenset(name for name, _ in CROSS_CHAIN_SELL_PULL_PARAMS_FIELDS),
    ),
    "cancel_polymarket": TypedDataSchema(
        primary_type="CancelOrder",
        domain=_PREFUNDED_DOMAIN,
        fields=CANCEL_ORDER_FIELDS,
        message_keys=frozenset(name for name, _ in CANCEL_ORDER_FIELDS),
    ),
    "cancel_opinion_polygon": TypedDataSchema(
        primary_type="CancelOrder",
        domain=_PREFUNDED_DOMAIN,
        fields=CANCEL_ORDER_FIELDS,
        message_keys=frozenset(name for name, _ in CANCEL_ORDER_FIELDS),
    ),
    "cancel_opinion_bsc_pull": TypedDataSchema(
        primary_type="CancelPull",
        domain=_VENUE_DOMAIN,
        fields=CANCEL_PULL_FIELDS,
        message_keys=frozenset(name for name, _ in CANCEL_PULL_FIELDS),
    ),
}


def validate_typed_data(typed_data: dict[str, Any], route: str, wallet_address: str) -> None:
    """Validate hosted-mode typed data before invoking a signer."""

    schema = _schema_for(route, _typed_data_fail)
    if not isinstance(typed_data, Mapping):
        _typed_data_fail("typed_data must be a dict")

    primary_type = typed_data.get("primaryType")
    if primary_type != schema.primary_type:
        _typed_data_fail(
            f"primaryType expected {schema.primary_type!r} got {primary_type!r}",
        )

    types = _expect_mapping(typed_data.get("types"), "types", _typed_data_fail)
    domain = _expect_mapping(typed_data.get("domain"), "domain", _typed_data_fail)
    message = _expect_mapping(typed_data.get("message"), "message", _typed_data_fail)

    _validate_domain(domain, schema.domain)
    _validate_types(types, schema)
    _validate_message(message, schema, wallet_address)


def validate_economics(
    typed_data: dict[str, Any] | None = None,
    route: str | None = None,
    build_request: dict[str, Any] | None = None,
    build_response: dict[str, Any] | None = None,
) -> None:
    """Reject typed data whose economics do not match the build request/response."""

    if route is None:
        _economic_fail("route is required")
    if build_request is None:
        _economic_fail("build_request is required")
    if build_response is None:
        _economic_fail("build_response is required")
    if typed_data is None:
        candidate = _value(build_response, "typed_data")
        if candidate is _MISSING or candidate is None:
            _economic_fail("typed_data missing")
        typed_data = candidate

    _schema_for(route, _economic_fail)
    if not isinstance(typed_data, Mapping):
        _economic_fail("typed_data must be a dict")
    message = _expect_mapping(typed_data.get("message"), "message", _economic_fail)

    if route == "polymarket_buy":
        _validate_polymarket_buy_economics(message, build_request)
        _validate_worst_price(message, route, build_request, build_response)
    elif route == "polymarket_sell":
        _validate_polymarket_sell_economics(message, build_request)
        _validate_worst_price(message, route, build_request, build_response)
    elif route in {"opinion_buy", "opinion_sell_polygon", "opinion_sell_bsc_pull"}:
        _validate_opinion_market_id(message, build_response)


def verify_signature(typed_data: dict[str, Any], signature: str, wallet_address: str) -> str:
    """Recover and verify an EIP-712 signature, returning the normalized signature."""

    if not isinstance(signature, str) or not _SIGNATURE_RE.fullmatch(signature):
        raise InvalidSignature("signature must be 0x-prefixed 65-byte hex")

    raw = bytes.fromhex(signature[2:])
    s_value = int.from_bytes(raw[32:64], "big")
    if s_value > _SECP256K1_HALF_N:
        raise InvalidSignature("non-canonical (high-s)")

    v_value = raw[64]
    if v_value in (0, 1):
        raw = raw[:64] + bytes([v_value + 27])
        v_value += 27
    if v_value not in (27, 28):
        raise InvalidSignature(f"invalid recovery byte: {v_value}")

    normalized = "0x" + raw.hex()
    try:
        from eth_account import Account
        from eth_account.messages import encode_typed_data
    except ImportError as exc:  # pragma: no cover - optional [hosted] dependency.
        raise InvalidSignature("eth-account is required for hosted signature verification") from exc

    try:
        signable = encode_typed_data(full_message=typed_data)
        recovered = Account.recover_message(signable, signature=normalized)
    except Exception as exc:  # pragma: no cover - exact eth-account exceptions vary.
        raise InvalidSignature("signature recovery failed") from exc

    if not _addresses_equal(recovered, wallet_address):
        raise InvalidSignature(
            f"signature signer mismatch: expected {wallet_address} got {recovered}",
        )

    return normalized


def _validate_domain(domain: Mapping[str, Any], expected: DomainSchema) -> None:
    actual_keys = frozenset(domain.keys())
    expected_keys = frozenset({"name", "version", "chainId", "verifyingContract"})
    if actual_keys != expected_keys:
        _typed_data_fail(
            f"domain keys expected {sorted(expected_keys)} got {sorted(actual_keys)}",
        )

    if domain.get("name") != expected.name:
        _typed_data_fail(f"domain.name expected {expected.name!r} got {domain.get('name')!r}")
    if domain.get("version") != expected.version:
        _typed_data_fail(
            f"domain.version expected {expected.version!r} got {domain.get('version')!r}",
        )

    chain_id = _as_int(domain.get("chainId"), "domain.chainId", _typed_data_fail)
    if chain_id != expected.chain_id:
        _typed_data_fail(f"domain.chainId expected {expected.chain_id} got {chain_id}")

    verifying_contract = _normalize_address(domain.get("verifyingContract"))
    if verifying_contract is None:
        _typed_data_fail("domain.verifyingContract must be an EVM address")

    allowed = _allowed_addresses(expected.verifying_contracts, expected.chain_id)
    if not allowed:
        _typed_data_fail(
            f"no allowlisted verifyingContract configured for chain {expected.chain_id}",
        )
    if verifying_contract not in allowed:
        _typed_data_fail("domain.verifyingContract is not allowlisted")


def _validate_types(types: Mapping[str, Any], schema: TypedDataSchema) -> None:
    type_names = frozenset(types.keys())
    allowed = frozenset({schema.primary_type, "EIP712Domain"})
    if not type_names.issubset(allowed):
        unexpected = sorted(type_names - allowed)
        _typed_data_fail(f"unexpected type entries: {unexpected}")
    if "EIP712Domain" not in types:
        _typed_data_fail("types.EIP712Domain is required")
    if schema.primary_type not in types:
        _typed_data_fail(f"types.{schema.primary_type} is required")

    domain_fields = _field_list(types["EIP712Domain"], "types.EIP712Domain", _typed_data_fail)
    if domain_fields != EIP712_DOMAIN_FIELDS:
        _typed_data_fail("types.EIP712Domain field order mismatch")

    actual_fields = _field_list(
        types[schema.primary_type],
        f"types.{schema.primary_type}",
        _typed_data_fail,
    )
    if actual_fields != schema.fields:
        _typed_data_fail(
            f"types.{schema.primary_type} fields expected {schema.fields!r} got {actual_fields!r}",
        )


def _validate_message(
    message: Mapping[str, Any],
    schema: TypedDataSchema,
    wallet_address: str,
) -> None:
    actual_keys = frozenset(message.keys())
    if actual_keys != schema.message_keys:
        _typed_data_fail(
            f"message keys expected {sorted(schema.message_keys)} got {sorted(actual_keys)}",
        )

    wallet_value = message.get(schema.wallet_field)
    if not _addresses_equal(wallet_value, wallet_address):
        _typed_data_fail(f"message.{schema.wallet_field} does not match wallet_address")

    deadline_key = "deadline" if "deadline" in message else "expiry" if "expiry" in message else None
    if deadline_key is None:
        _typed_data_fail("message.deadline/expiry is required")
    deadline = _as_int(message.get(deadline_key), f"message.{deadline_key}", _typed_data_fail)
    if deadline <= int(time.time()):
        _typed_data_fail(f"message.{deadline_key} is expired")


def _validate_polymarket_buy_economics(
    message: Mapping[str, Any],
    build_request: Any,
) -> None:
    denom = _value(build_request, "denom")
    if denom != "usdc":
        _economic_fail(f"denom expected 'usdc' got {denom!r}")

    amount = _first_present(
        _value(build_request, "amount"),
        _value(build_request, "amount_usdc"),
        _value(build_request, "amountUsdc"),
    )
    if amount is _MISSING:
        _economic_fail("amount missing")

    expected = _to_6dec(amount, "max_cost_usdc")
    actual = _message_int(message, "max_cost_usdc", "maxCostUsdc")
    if actual != expected:
        _economic_fail(f"max_cost_usdc expected {expected} got {actual}")


def _validate_polymarket_sell_economics(
    message: Mapping[str, Any],
    build_request: Any,
) -> None:
    denom = _value(build_request, "denom")
    if denom != "shares":
        _economic_fail(f"denom expected 'shares' got {denom!r}")

    amount = _first_present(_value(build_request, "amount"), _value(build_request, "shares"))
    if amount is _MISSING:
        _economic_fail("amount missing")

    expected = _to_6dec(amount, "shares_6dec")
    actual = _message_int(message, "shares_6dec", "shares6dec", "tokenAmount")
    if actual != expected:
        _economic_fail(f"shares_6dec expected {expected} got {actual}")


def _validate_worst_price(
    message: Mapping[str, Any],
    route: str,
    build_request: Any,
    build_response: Any,
) -> None:
    worst_price = Decimal(_message_int(message, "worst_price", "worstPrice")) / _SIX_DEC_SCALE

    # Hosted MARKET orders pin worst_price to the tick-grid extreme by design
    # ("textbook market semantics"): the binding user protection is
    # max_cost_usdc (buys) / shares_6dec (sells), validated above. A slippage
    # bound on worst_price would reject every server-built market order, so
    # only sanity-check the price domain here.
    order_type = str(
        _first_present(
            _value(build_request, "order_type"),
            _value(build_request, "orderType"),
            "market",
        )
    ).lower()
    if order_type == "market":
        if not (Decimal("0") < worst_price < Decimal("1")):
            _economic_fail(f"worst_price expected within (0, 1) got {worst_price}")
        return

    slippage_pct = _decimal(
        _first_present(
            _value(build_request, "slippage_pct"),
            _value(build_request, "slippagePct"),
            _value(build_response, "slippage_pct"),
            _value(build_response, "slippagePct"),
            Decimal("20"),
        ),
        "slippage_pct",
        _economic_fail,
    )

    if route == "polymarket_buy":
        best_price = _decimal(
            _first_present(
                _path(build_response, "quote", "best_price"),
                _value(build_response, "best_price"),
                _value(build_response, "best_ask"),
                _value(build_response, "bestAsk"),
            ),
            "quote.best_price",
            _economic_fail,
        )
        upper_bound = best_price * (Decimal("1") + (slippage_pct / Decimal("100")))
        if worst_price > upper_bound:
            _economic_fail(f"worst_price expected <= {upper_bound} got {worst_price}")
    elif route == "polymarket_sell":
        best_price = _decimal(
            _first_present(
                _path(build_response, "quote", "best_price"),
                _value(build_response, "best_price"),
                _value(build_response, "best_bid"),
                _value(build_response, "bestBid"),
            ),
            "quote.best_price",
            _economic_fail,
        )
        lower_bound = best_price * (Decimal("1") - (slippage_pct / Decimal("100")))
        if worst_price < lower_bound:
            _economic_fail(f"worst_price expected >= {lower_bound} got {worst_price}")


def _validate_opinion_market_id(message: Mapping[str, Any], build_response: Any) -> None:
    expected = _first_present(
        _path(build_response, "resolved", "opinion_market_id"),
        _path(build_response, "resolved", "opinionMarketId"),
        _value(build_response, "opinion_market_id"),
        _value(build_response, "opinionMarketId"),
        _path(build_response, "params", "opinion_market_id"),
        _path(build_response, "params", "opinionMarketId"),
    )
    if expected is _MISSING:
        _economic_fail("resolved.opinion_market_id missing")

    actual = _first_present(
        _value(message, "opinion_market_id"),
        _value(message, "opinionMarketId"),
        _path(build_response, "params", "opinion_market_id"),
        _path(build_response, "params", "opinionMarketId"),
    )
    if actual is _MISSING:
        _economic_fail("message.opinion_market_id missing")

    if _id_value(actual, "message.opinion_market_id") != _id_value(
        expected,
        "resolved.opinion_market_id",
    ):
        _economic_fail(f"opinion_market_id expected {expected} got {actual}")


def _schema_for(route: str | None, fail: FailFn) -> TypedDataSchema:
    if route is None:
        fail("route is required")
    schema = SCHEMAS.get(route)
    if schema is None:
        fail(f"unknown typed-data route: {route!r}")
    return schema


def _expect_mapping(value: Any, label: str, fail: FailFn) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        fail(f"{label} must be a dict")
    return value


def _field_list(value: Any, label: str, fail: FailFn) -> FieldList:
    if isinstance(value, (str, bytes, bytearray)) or not isinstance(value, Sequence):
        fail(f"{label} must be a list of fields")

    fields: list[tuple[str, str]] = []
    for index, item in enumerate(value):
        field = _expect_mapping(item, f"{label}[{index}]", fail)
        name = field.get("name")
        typ = field.get("type")
        if not isinstance(name, str) or not isinstance(typ, str):
            fail(f"{label}[{index}] must contain string name/type")
        fields.append((name, typ))
    return tuple(fields)


def _as_int(value: Any, label: str, fail: FailFn) -> int:
    if isinstance(value, bool):
        fail(f"{label} must be an integer")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return int(value, 10)
        except ValueError:
            fail(f"{label} must be an integer")
    fail(f"{label} must be an integer")
    return 0  # unreachable; fail() raises


def _normalize_address(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if not _ADDRESS_RE.fullmatch(candidate):
        return None
    return candidate.lower()


def _allowed_addresses(values: Any, chain_id: int) -> frozenset[str]:
    if isinstance(values, Mapping):
        raw_values = values.get(chain_id) or values.get(str(chain_id)) or ()
    else:
        raw_values = values

    if isinstance(raw_values, str):
        iterable = (raw_values,)
    elif isinstance(raw_values, (set, frozenset, tuple, list)):
        iterable = raw_values
    else:
        return frozenset()

    return frozenset(
        normalized
        for value in iterable
        if (normalized := _normalize_address(value)) is not None
    )


def _addresses_equal(left: Any, right: Any) -> bool:
    left_normalized = _normalize_address(left)
    right_normalized = _normalize_address(right)
    return left_normalized is not None and left_normalized == right_normalized


def _value(container: Any, key: str) -> Any:
    if isinstance(container, Mapping):
        return container[key] if key in container else _MISSING
    return getattr(container, key, _MISSING)


def _path(container: Any, *keys: str) -> Any:
    current = container
    for key in keys:
        current = _value(current, key)
        if current is _MISSING:
            return _MISSING
    return current


def _first_present(*values: Any) -> Any:
    for value in values:
        if value is not _MISSING and value is not None:
            return value
    return _MISSING


def _decimal(value: Any, label: str, fail: FailFn) -> Decimal:
    if value is _MISSING:
        fail(f"{label} missing")
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise InvalidSignature(f"{label} must be a decimal") from exc
    if not result.is_finite():
        fail(f"{label} must be finite")
    return result


def _to_6dec(value: Any, label: str) -> int:
    try:
        return to_6dec(value)
    except Exception as exc:
        raise InvalidSignature(f"{label} must fit the 6-decimal grid") from exc


def _message_int(message: Mapping[str, Any], *keys: str) -> int:
    value = _first_present(*(_value(message, key) for key in keys))
    if value is _MISSING:
        _economic_fail(f"message.{keys[0]} missing")
    return _as_int(value, f"message.{keys[0]}", _economic_fail)


def _id_value(value: Any, label: str) -> str:
    return str(_as_int(value, label, _economic_fail))


def _typed_data_fail(message: str) -> None:
    raise InvalidSignature(f"typed_data schema mismatch: {message}")


def _economic_fail(message: str) -> None:
    raise InvalidSignature(f"economic mismatch: {message}")

