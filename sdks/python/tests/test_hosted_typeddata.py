"""Hosted typed-data guardrail tests for the Python SDK."""

from __future__ import annotations

import copy
from typing import Any

import pytest
from eth_account import Account
from eth_account.messages import encode_typed_data

from pmxt._hosted_errors import InvalidSignature
from pmxt._hosted_mappers import to_6dec
from pmxt._hosted_typeddata import (
    validate_economics,
    validate_typed_data,
    verify_signature,
)
from pmxt.errors import InvalidOrder
from pmxt.constants import (
    LIMITLESS_VENUE_ESCROW_ADDRESSES,
    PREFUNDED_ESCROW_ADDRESSES,
    VENUE_ESCROW_ADDRESSES,
)

WALLET_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
OTHER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945380e9dae9ce5a4e282d1e0c0889c34cb14d"
WALLET_ADDRESS = Account.from_key(WALLET_PRIVATE_KEY).address
OTHER_ADDRESS = Account.from_key(OTHER_PRIVATE_KEY).address

POLYGON_CHAIN_ID = 137
BSC_CHAIN_ID = 56
BASE_CHAIN_ID = 8453
FUTURE_DEADLINE = 4_102_444_800
PAST_DEADLINE = 1_700_000_000
PREFUNDED_ESCROW_ADDRESS = next(iter(PREFUNDED_ESCROW_ADDRESSES))
OPINION_VENUE_ESCROW_ADDRESS = next(iter(VENUE_ESCROW_ADDRESSES))
LIMITLESS_VENUE_ESCROW_ADDRESS = next(iter(LIMITLESS_VENUE_ESCROW_ADDRESSES))
VENUE_ESCROW_ADDRESS = "0x0000000000000000000000000000000000000088"
SETTLEMENT_ORACLE_ADDRESS = "0x0000000000000000000000000000000000000077"
FOREIGN_CONTRACT_ADDRESS = "0x3333333333333333333333333333333333333333"

MARKET_ID = "2fdaf2e8-6cf6-48c6-b24c-961c0f430ac2"
OUTCOME_ID = "0e4c8fee-7406-4410-86c3-8447835afef7"
TOKEN_ID = 21_710_572_061_701_407_300_749_657_184_096_413_067

SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
SECP256K1_HALF_N = SECP256K1_N // 2


def _fields(*pairs: tuple[str, str]) -> list[dict[str, str]]:
    return [{"name": name, "type": typ} for name, typ in pairs]


def _domain(
    name: str,
    verifying_contract: str,
    chain_id: int = POLYGON_CHAIN_ID,
) -> dict[str, Any]:
    return {
        "name": name,
        "version": "1",
        "chainId": chain_id,
        "verifyingContract": verifying_contract,
    }


def _polymarket_buy_typed_data() -> dict[str, Any]:
    return {
        "types": {
            "EIP712Domain": _fields(
                ("name", "string"),
                ("version", "string"),
                ("chainId", "uint256"),
                ("verifyingContract", "address"),
            ),
            "OrderParams": _fields(
                ("user", "address"),
                ("tokenId", "uint256"),
                ("worstPrice", "uint256"),
                ("maxCostUsdc", "uint256"),
                ("deadline", "uint256"),
                ("nonce", "uint256"),
            ),
        },
        "primaryType": "OrderParams",
        "domain": _domain("PreFundedEscrow", PREFUNDED_ESCROW_ADDRESS),
        "message": {
            "user": WALLET_ADDRESS,
            "tokenId": TOKEN_ID,
            "worstPrice": 505_000,
            "maxCostUsdc": 5_000_000,
            "deadline": FUTURE_DEADLINE,
            "nonce": 1001,
        },
    }


def _polymarket_sell_typed_data() -> dict[str, Any]:
    return {
        "types": {
            "EIP712Domain": _fields(
                ("name", "string"),
                ("version", "string"),
                ("chainId", "uint256"),
                ("verifyingContract", "address"),
            ),
            "SellOrderParams": _fields(
                ("user", "address"),
                ("tokenId", "uint256"),
                ("tokenAmount", "uint256"),
                ("worstPrice", "uint256"),
                ("deadline", "uint256"),
                ("nonce", "uint256"),
            ),
        },
        "primaryType": "SellOrderParams",
        "domain": _domain("PreFundedEscrow", PREFUNDED_ESCROW_ADDRESS),
        "message": {
            "user": WALLET_ADDRESS,
            "tokenId": TOKEN_ID,
            "tokenAmount": 3_000_000,
            "worstPrice": 396_000,
            "deadline": FUTURE_DEADLINE,
            "nonce": 1002,
        },
    }


def _opinion_buy_typed_data() -> dict[str, Any]:
    return {
        "types": {
            "EIP712Domain": _fields(
                ("name", "string"),
                ("version", "string"),
                ("chainId", "uint256"),
                ("verifyingContract", "address"),
            ),
            "CrossChainOrderParams": _fields(
                ("user", "address"),
                ("tokenId", "uint256"),
                ("maxCostUsdc", "uint256"),
                ("worstPrice", "uint256"),
                ("destEscrow", "address"),
                ("oracleKey", "address"),
                ("deadline", "uint256"),
                ("nonce", "uint256"),
            ),
        },
        "primaryType": "CrossChainOrderParams",
        "domain": _domain("PreFundedEscrow", PREFUNDED_ESCROW_ADDRESS),
        "message": {
            "user": WALLET_ADDRESS,
            "tokenId": TOKEN_ID,
            "maxCostUsdc": 2_500_000,
            "worstPrice": 202_000,
            "destEscrow": VENUE_ESCROW_ADDRESS,
            "oracleKey": SETTLEMENT_ORACLE_ADDRESS,
            "deadline": FUTURE_DEADLINE,
            "nonce": 1003,
        },
    }


def _cancel_order_typed_data(
    verifying_contract: str = PREFUNDED_ESCROW_ADDRESS,
    chain_id: int = POLYGON_CHAIN_ID,
) -> dict[str, Any]:
    return {
        "types": {
            "EIP712Domain": _fields(
                ("name", "string"),
                ("version", "string"),
                ("chainId", "uint256"),
                ("verifyingContract", "address"),
            ),
            "CancelOrder": _fields(
                ("user", "address"),
                ("path", "uint8"),
                ("nonce", "uint256"),
                ("deadline", "uint256"),
            ),
        },
        "primaryType": "CancelOrder",
        "domain": _domain("PreFundedEscrow", verifying_contract, chain_id),
        "message": {
            "user": WALLET_ADDRESS,
            "path": 0,
            "nonce": 2001,
            "deadline": FUTURE_DEADLINE,
        },
    }


def _cancel_pull_typed_data(
    verifying_contract: str,
    chain_id: int,
) -> dict[str, Any]:
    return {
        "types": {
            "EIP712Domain": _fields(
                ("name", "string"),
                ("version", "string"),
                ("chainId", "uint256"),
                ("verifyingContract", "address"),
            ),
            "CancelPull": _fields(
                ("user", "address"),
                ("nonce", "uint256"),
                ("deadline", "uint256"),
            ),
        },
        "primaryType": "CancelPull",
        "domain": _domain("VenueEscrow", verifying_contract, chain_id),
        "message": {
            "user": WALLET_ADDRESS,
            "nonce": 2002,
            "deadline": FUTURE_DEADLINE,
        },
    }


def _build_request(side: str, amount: str, denom: str, slippage_pct: str) -> dict[str, Any]:
    return {
        "market_id": MARKET_ID,
        "outcome_id": OUTCOME_ID,
        "side": side,
        "order_type": "market",
        "amount": amount,
        "denom": denom,
        "slippage_pct": slippage_pct,
        "user_address": WALLET_ADDRESS,
    }


def _build_response(
    *,
    side: str,
    typed_data: dict[str, Any],
    params: dict[str, Any],
    best_price: float,
    tick_size: str,
    venue: str,
    opinion_market_id: int | None = None,
) -> dict[str, Any]:
    return {
        "built_order_id": f"fixture-{venue}-{side}",
        "side": side,
        "typed_data": typed_data,
        "pull_typed_data": None,
        "params": params,
        "quote": {
            "best_price": best_price,
            "expected_avg_price": best_price,
            "expected_slippage_pct": 0.0,
            "estimated_cost_or_proceeds": 5.0 if side == "buy" else 1.2,
            "fillable": True,
            "liquidity": 500.0,
            "fee_amount": 0.0,
            "tick_size": tick_size,
        },
        "resolved": {
            "venue": venue,
            "token_id": str(TOKEN_ID),
            "neg_risk": False,
            "tick_size": tick_size,
            "opinion_market_id": opinion_market_id,
        },
    }


POLYMARKET_BUY_TYPED_DATA = _polymarket_buy_typed_data()
POLYMARKET_SELL_TYPED_DATA = _polymarket_sell_typed_data()
OPINION_BUY_TYPED_DATA = _opinion_buy_typed_data()

POSITIVE_FIXTURES: tuple[dict[str, Any], ...] = (
    {
        "route": "polymarket_buy",
        "build_request": _build_request("buy", "5.0", "usdc", "1.0"),
        "build_response": _build_response(
            side="buy",
            typed_data=POLYMARKET_BUY_TYPED_DATA,
            params={
                "user": WALLET_ADDRESS,
                "token_id": str(TOKEN_ID),
                "worst_price": "505000",
                "max_cost_usdc": "5000000",
                "deadline": str(FUTURE_DEADLINE),
                "nonce": "1001",
                "neg_risk": False,
                "tick_size": "0.001",
                "venue": "polymarket",
            },
            best_price=0.50,
            tick_size="0.001",
            venue="polymarket",
        ),
    },
    {
        "route": "polymarket_sell",
        "build_request": _build_request("sell", "3.0", "shares", "1.0"),
        "build_response": _build_response(
            side="sell",
            typed_data=POLYMARKET_SELL_TYPED_DATA,
            params={
                "user": WALLET_ADDRESS,
                "token_id": str(TOKEN_ID),
                "shares_6dec": "3000000",
                "worst_price": "396000",
                "deadline": str(FUTURE_DEADLINE),
                "nonce": "1002",
                "neg_risk": False,
                "tick_size": "0.001",
                "venue": "polymarket",
            },
            best_price=0.40,
            tick_size="0.001",
            venue="polymarket",
        ),
    },
    {
        "route": "opinion_buy",
        "build_request": _build_request("buy", "2.5", "usdc", "1.0"),
        "build_response": _build_response(
            side="buy",
            typed_data=OPINION_BUY_TYPED_DATA,
            params={
                "user": WALLET_ADDRESS,
                "token_id": str(TOKEN_ID),
                "worst_price": "202000",
                "max_cost_usdc": "2500000",
                "deadline": str(FUTURE_DEADLINE),
                "nonce": "1003",
                "neg_risk": False,
                "tick_size": "0.001",
                "venue": "opinion",
                "opinion_market_id": 42,
            },
            best_price=0.20,
            tick_size="0.001",
            venue="opinion",
            opinion_market_id=42,
        ),
    },
)

CANCEL_ROUTE_FIXTURES: tuple[dict[str, Any], ...] = (
    {
        "route": "cancel_polymarket",
        "typed_data": _cancel_order_typed_data(),
    },
    {
        "route": "cancel_opinion_polygon",
        "typed_data": _cancel_order_typed_data(),
    },
    {
        "route": "cancel_opinion_bsc_pull",
        "typed_data": _cancel_pull_typed_data(
            OPINION_VENUE_ESCROW_ADDRESS,
            BSC_CHAIN_ID,
        ),
    },
    {
        "route": "cancel_limitless_polygon",
        "typed_data": _cancel_order_typed_data(),
    },
    {
        "route": "cancel_limitless_base_pull",
        "typed_data": _cancel_pull_typed_data(
            LIMITLESS_VENUE_ESCROW_ADDRESS,
            BASE_CHAIN_ID,
        ),
    },
)


def _copy(value: Any) -> Any:
    return copy.deepcopy(value)


def _fixture(route: str) -> dict[str, Any]:
    matches = tuple(fixture for fixture in POSITIVE_FIXTURES if fixture["route"] == route)
    assert len(matches) == 1
    return matches[0]


def _typed_data(route: str) -> dict[str, Any]:
    return _fixture(route)["build_response"]["typed_data"]


def _replace_path(value: dict[str, Any], path: tuple[str, ...], replacement: Any) -> dict[str, Any]:
    key = path[0]
    if len(path) == 1:
        return {**value, key: replacement}
    return {**value, key: _replace_path(value[key], path[1:], replacement)}


def _remove_path(value: dict[str, Any], path: tuple[str, ...]) -> dict[str, Any]:
    key = path[0]
    if len(path) == 1:
        return {
            current_key: current_value
            for current_key, current_value in value.items()
            if current_key != key
        }
    return {**value, key: _remove_path(value[key], path[1:])}


def _reorder_primary_type_fields(typed_data: dict[str, Any]) -> dict[str, Any]:
    primary_type = typed_data["primaryType"]
    fields = typed_data["types"][primary_type]
    reordered = [fields[1], fields[0], *fields[2:]]
    return _replace_path(typed_data, ("types", primary_type), reordered)


def _with_message_key(typed_data: dict[str, Any], key: str, value: Any) -> dict[str, Any]:
    return _replace_path(typed_data, ("message",), {**typed_data["message"], key: value})


def _with_response_field(
    response: dict[str, Any],
    message_field: str,
    params_field: str,
    value: int,
) -> dict[str, Any]:
    with_message = _replace_path(response, ("typed_data", "message", message_field), value)
    return _replace_path(with_message, ("params", params_field), str(value))


def _sign(typed_data: dict[str, Any], private_key: str = WALLET_PRIVATE_KEY) -> str:
    signable = encode_typed_data(full_message=typed_data)
    signature = Account.sign_message(signable, private_key=private_key).signature.hex()
    return signature if signature.startswith("0x") else f"0x{signature}"


def _signature_body(signature: str) -> str:
    return signature[2:].lower() if signature.startswith("0x") else signature.lower()


def _signature_s(signature: str) -> int:
    return int(_signature_body(signature)[64:128], 16)


def _signature_v(signature: str) -> int:
    return int(_signature_body(signature)[128:130], 16)


def _replace_s(signature: str, s_value: int) -> str:
    body = _signature_body(signature)
    return f"0x{body[:64]}{s_value:064x}{body[128:130]}"


def _replace_v(signature: str, v_value: int) -> str:
    body = _signature_body(signature)
    return f"0x{body[:128]}{v_value:02x}"


def _high_s_signature(signature: str) -> str:
    s_value = _signature_s(signature)
    high_s = SECP256K1_N - s_value if s_value <= SECP256K1_HALF_N else s_value
    canonical_high_s = high_s if high_s > SECP256K1_HALF_N else SECP256K1_HALF_N + 1
    return _replace_s(signature, canonical_high_s)


@pytest.mark.parametrize("fixture", POSITIVE_FIXTURES, ids=lambda fixture: fixture["route"])
def test_validate_typed_data_accepts_prod_route_fixtures(fixture: dict[str, Any]) -> None:
    validate_typed_data(
        route=fixture["route"],
        typed_data=_copy(fixture["build_response"]["typed_data"]),
        wallet_address=WALLET_ADDRESS,
    )


@pytest.mark.parametrize("fixture", CANCEL_ROUTE_FIXTURES, ids=lambda fixture: fixture["route"])
def test_validate_typed_data_accepts_cancel_route_fixtures(fixture: dict[str, Any]) -> None:
    validate_typed_data(
        route=fixture["route"],
        typed_data=_copy(fixture["typed_data"]),
        wallet_address=WALLET_ADDRESS,
    )


@pytest.mark.parametrize("fixture", POSITIVE_FIXTURES, ids=lambda fixture: fixture["route"])
def test_validate_economics_accepts_matching_build_request_response(
    fixture: dict[str, Any],
) -> None:
    validate_economics(
        route=fixture["route"],
        build_request=_copy(fixture["build_request"]),
        build_response=_copy(fixture["build_response"]),
    )


@pytest.mark.parametrize(
    ("case_name", "typed_data"),
    (
        pytest.param(
            "wrong_chain_id",
            _replace_path(_typed_data("polymarket_buy"), ("domain", "chainId"), 1),
            id="wrong_chain_id",
        ),
        pytest.param(
            "foreign_verifying_contract",
            _replace_path(
                _typed_data("polymarket_buy"),
                ("domain", "verifyingContract"),
                FOREIGN_CONTRACT_ADDRESS,
            ),
            id="foreign_verifying_contract",
        ),
        pytest.param(
            "reordered_primary_type_fields",
            _reorder_primary_type_fields(_typed_data("polymarket_buy")),
            id="reordered_primary_type_fields",
        ),
        pytest.param(
            "extra_message_key",
            _with_message_key(_typed_data("polymarket_buy"), "unexpected", 1),
            id="extra_message_key",
        ),
        pytest.param(
            "missing_required_message_key",
            _remove_path(_typed_data("polymarket_buy"), ("message", "nonce")),
            id="missing_required_message_key",
        ),
        pytest.param(
            "expired_deadline",
            _replace_path(
                _typed_data("polymarket_buy"),
                ("message", "deadline"),
                PAST_DEADLINE,
            ),
            id="expired_deadline",
        ),
        pytest.param(
            "mismatched_user",
            _replace_path(
                _typed_data("polymarket_buy"),
                ("message", "user"),
                OTHER_ADDRESS,
            ),
            id="mismatched_user",
        ),
    ),
)
def test_validate_typed_data_rejects_schema_guardrails(
    case_name: str,
    typed_data: dict[str, Any],
) -> None:
    assert case_name
    with pytest.raises(InvalidSignature):
        validate_typed_data(
            route="polymarket_buy",
            typed_data=_copy(typed_data),
            wallet_address=WALLET_ADDRESS,
        )


def test_validate_economics_rejects_tampered_max_cost_usdc() -> None:
    fixture = _fixture("polymarket_buy")
    response = _with_response_field(
        fixture["build_response"],
        "maxCostUsdc",
        "max_cost_usdc",
        50_000_000,
    )

    with pytest.raises(InvalidSignature):
        validate_economics(
            route=fixture["route"],
            build_request=_copy(fixture["build_request"]),
            build_response=response,
        )


def test_validate_economics_rejects_worst_price_outside_slippage_bound_for_limit() -> None:
    fixture = _fixture("polymarket_buy")
    build_request = {**_copy(fixture["build_request"]), "order_type": "limit"}
    response = _with_response_field(
        fixture["build_response"],
        "worstPrice",
        "worst_price",
        900_000,
    )

    with pytest.raises(InvalidSignature):
        validate_economics(
            route=fixture["route"],
            build_request=build_request,
            build_response=response,
        )


def test_validate_economics_accepts_pinned_worst_price_for_market_orders() -> None:
    """Hosted market orders pin worst_price to the tick-grid extreme by
    design — max_cost_usdc is the binding user protection. The validator
    must NOT apply the limit-order slippage bound (regression: every
    documented quickstart market buy was rejected pre-sign)."""
    fixture = _fixture("polymarket_buy")
    response = _with_response_field(
        fixture["build_response"],
        "worstPrice",
        "worst_price",
        999_000,
    )

    validate_economics(
        route=fixture["route"],
        build_request=_copy(fixture["build_request"]),
        build_response=response,
    )


@pytest.mark.parametrize("pinned", [0, 1_000_000, 2_000_000])
def test_validate_economics_rejects_market_worst_price_outside_domain(pinned: int) -> None:
    fixture = _fixture("polymarket_buy")
    response = _with_response_field(
        fixture["build_response"],
        "worstPrice",
        "worst_price",
        pinned,
    )

    with pytest.raises(InvalidSignature):
        validate_economics(
            route=fixture["route"],
            build_request=_copy(fixture["build_request"]),
            build_response=response,
        )


def test_validate_economics_rejects_opinion_token_id_mismatch() -> None:
    # The signed economic identity on Opinion is the outcome tokenId — a
    # build response resolving a different token than the message must fail.
    fixture = _fixture("opinion_buy")
    response = _replace_path(fixture["build_response"], ("resolved", "token_id"), "7777")

    with pytest.raises(InvalidSignature):
        validate_economics(
            route=fixture["route"],
            build_request=_copy(fixture["build_request"]),
            build_response=response,
        )


def test_validate_economics_ignores_params_market_id_when_message_has_no_field() -> None:
    # Current API schema: the signed message carries tokenId only. A
    # params/resolved opinion_market_id quirk must NOT block the order —
    # requiring message.opinion_market_id blocked every real Opinion order.
    fixture = _fixture("opinion_buy")
    response = _replace_path(fixture["build_response"], ("params", "opinion_market_id"), 7_777)

    validate_economics(
        route=fixture["route"],
        build_request=_copy(fixture["build_request"]),
        build_response=response,
    )


def test_validate_economics_rejects_legacy_message_market_id_mismatch() -> None:
    # Legacy schema: when the message DOES carry opinion_market_id it must
    # still match the build response.
    fixture = _fixture("opinion_buy")
    response = _copy(fixture["build_response"])
    response["typed_data"]["message"]["opinion_market_id"] = 1234
    response["resolved"]["opinion_market_id"] = 7_777

    with pytest.raises(InvalidSignature):
        validate_economics(
            route=fixture["route"],
            build_request=_copy(fixture["build_request"]),
            build_response=response,
        )


@pytest.mark.parametrize("fixture", POSITIVE_FIXTURES, ids=lambda fixture: fixture["route"])
def test_verify_signature_accepts_valid_signatures_for_all_routes(
    fixture: dict[str, Any],
) -> None:
    typed_data = _copy(fixture["build_response"]["typed_data"])
    signature = _sign(typed_data)

    assert (
        verify_signature(
            typed_data=typed_data,
            signature=signature,
            wallet_address=WALLET_ADDRESS,
        ).lower()
        == signature.lower()
    )


def test_verify_signature_rejects_high_s_signature() -> None:
    typed_data = _copy(_typed_data("polymarket_buy"))
    signature = _high_s_signature(_sign(typed_data))

    with pytest.raises(InvalidSignature):
        verify_signature(
            typed_data=typed_data,
            signature=signature,
            wallet_address=WALLET_ADDRESS,
        )


def test_verify_signature_rejects_wrong_length_signature() -> None:
    with pytest.raises(InvalidSignature):
        verify_signature(
            typed_data=_copy(_typed_data("polymarket_buy")),
            signature="0x" + "00" * 64,
            wallet_address=WALLET_ADDRESS,
        )


def test_verify_signature_rejects_wrong_recovered_address() -> None:
    typed_data = _copy(_typed_data("polymarket_buy"))
    signature = _sign(typed_data, private_key=OTHER_PRIVATE_KEY)

    with pytest.raises(InvalidSignature):
        verify_signature(
            typed_data=typed_data,
            signature=signature,
            wallet_address=WALLET_ADDRESS,
        )


def test_verify_signature_rejects_v_outside_allowed_set() -> None:
    typed_data = _copy(_typed_data("polymarket_buy"))
    signature = _replace_v(_sign(typed_data), 2)

    with pytest.raises(InvalidSignature):
        verify_signature(
            typed_data=typed_data,
            signature=signature,
            wallet_address=WALLET_ADDRESS,
        )


def test_verify_signature_normalizes_raw_v_values() -> None:
    typed_data = _copy(_typed_data("polymarket_buy"))
    signature = _sign(typed_data)
    raw_v_signature = _replace_v(signature, _signature_v(signature) - 27)

    normalized = verify_signature(
        typed_data=typed_data,
        signature=raw_v_signature,
        wallet_address=WALLET_ADDRESS,
    )

    assert normalized.lower() == signature.lower()
    assert _signature_v(normalized) in (27, 28)


@pytest.mark.parametrize(
    ("amount", "expected"),
    (
        (0.29, 290_000),
        (0.1, 100_000),
        ("1.2300000", 1_230_000),
    ),
)
def test_to_6dec_converts_without_float_drift(amount: float | str, expected: int) -> None:
    assert to_6dec(amount) == expected


def test_to_6dec_rejects_more_than_six_decimals() -> None:
    with pytest.raises(InvalidOrder):
        to_6dec(0.1234567)
