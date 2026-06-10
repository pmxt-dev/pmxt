"""Upstream error -> hosted exception mapping tests.

Verifies that ``raise_from_response`` translates each documented v0 error
shape to the correct ``HostedTradingError`` subclass and that multi-
inheritance lets existing ``except InsufficientFunds`` / ``except
InvalidOrder`` sites keep working.
"""

from __future__ import annotations

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


def _make_response(status: int, payload: object | None = None) -> httpx.Response:
    if payload is None:
        return httpx.Response(status, content=b"")
    return httpx.Response(status, json=payload)


# --------------------------------------------------------------------------- #
# Status-code-driven mappings
# --------------------------------------------------------------------------- #


class TestStatusCodeMapping:
    def test_401_maps_to_invalid_api_key(self):
        response = _make_response(401, {"detail": "Invalid api key"})

        with pytest.raises(InvalidApiKey) as exc_info:
            raise_from_response(response)

        assert exc_info.value.status == 401
        # Multi-inheritance: also catchable as AuthenticationError + HostedTradingError.
        assert isinstance(exc_info.value, AuthenticationError)
        assert isinstance(exc_info.value, HostedTradingError)
        assert isinstance(exc_info.value, PmxtError)

    def test_401_with_arbitrary_detail_still_maps_to_invalid_api_key(self):
        """Any 401 maps to InvalidApiKey regardless of the body."""
        response = _make_response(401, {"detail": "anything goes"})

        with pytest.raises(InvalidApiKey):
            raise_from_response(response)


# --------------------------------------------------------------------------- #
# Detail-pattern-driven mappings
# --------------------------------------------------------------------------- #


class TestInsufficientEscrowBalanceMapping:
    def test_403_with_insufficient_escrow_balance(self):
        response = _make_response(
            403, {"detail": "Insufficient escrow balance: 5 USDC required"}
        )

        with pytest.raises(InsufficientEscrowBalance):
            raise_from_response(response)

    def test_insufficient_escrow_balance_is_also_insufficient_funds(self):
        response = _make_response(
            403, {"detail": "Insufficient escrow balance"}
        )

        with pytest.raises(InsufficientFunds):
            raise_from_response(response)

    def test_insufficient_escrow_balance_is_also_hosted_trading_error(self):
        response = _make_response(
            403, {"detail": "Insufficient escrow balance"}
        )

        with pytest.raises(HostedTradingError):
            raise_from_response(response)

    def test_multi_inheritance_dual_catch(self):
        """The same instance must be catchable as both subclass and InsufficientFunds."""
        response = _make_response(
            403, {"detail": "Insufficient escrow balance: $5 needed"}
        )

        # Catch as InsufficientEscrowBalance first
        with pytest.raises(InsufficientEscrowBalance) as exc_info:
            raise_from_response(response)
        instance = exc_info.value
        assert isinstance(instance, InsufficientFunds)
        assert isinstance(instance, HostedTradingError)
        assert isinstance(instance, PmxtError)


class TestInvalidOrderMapping:
    def test_order_size_too_small_pattern(self):
        response = _make_response(
            422, {"detail": "amount is below the minimum allowed size"}
        )

        with pytest.raises(OrderSizeTooSmall):
            raise_from_response(response)

    def test_order_size_too_small_is_invalid_order(self):
        response = _make_response(
            422, {"detail": "value below the minimum"}
        )

        with pytest.raises(InvalidOrder):
            raise_from_response(response)

    def test_built_order_expired_pattern(self):
        response = _make_response(
            410, {"detail": "built_order_id expired after 300s"}
        )

        with pytest.raises(BuiltOrderExpired):
            raise_from_response(response)

    def test_built_order_expired_is_also_invalid_order(self):
        """Critical: pre-existing 'except InvalidOrder' sites catch this."""
        response = _make_response(
            410, {"detail": "cancel_id expired after 300s"}
        )

        with pytest.raises(InvalidOrder):
            raise_from_response(response)

    def test_no_liquidity_for_asks(self):
        response = _make_response(
            422, {"detail": "book has no resting asks for this market"}
        )

        with pytest.raises(NoLiquidity):
            raise_from_response(response)

    def test_no_liquidity_for_bids(self):
        response = _make_response(
            422, {"detail": "book has no resting bids for this market"}
        )

        with pytest.raises(NoLiquidity):
            raise_from_response(response)

    def test_no_liquidity_is_invalid_order(self):
        response = _make_response(
            422, {"detail": "book has no resting asks"}
        )

        with pytest.raises(InvalidOrder):
            raise_from_response(response)


class TestCatalogMapping:
    def test_outcome_not_found_pattern(self):
        response = _make_response(
            404, {"detail": "catalog: no outcome for the given id"}
        )

        with pytest.raises(OutcomeNotFound):
            raise_from_response(response)

    def test_outcome_not_found_is_also_not_found_error(self):
        response = _make_response(
            404, {"detail": "catalog: no outcome found"}
        )

        with pytest.raises(NotFoundError):
            raise_from_response(response)

    def test_catalog_unavailable_pattern(self):
        response = _make_response(
            503, {"detail": "catalog: temporarily unavailable"}
        )

        with pytest.raises(CatalogUnavailable):
            raise_from_response(response)

    def test_catalog_unavailable_is_also_exchange_not_available(self):
        response = _make_response(
            503, {"detail": "catalog: backend timeout"}
        )

        with pytest.raises(ExchangeNotAvailable):
            raise_from_response(response)


class TestSignatureMapping:
    def test_invalid_signature_in_200_body(self):
        response = _make_response(
            200, {"success": False, "error": "Invalid signature: recovered address mismatch"}
        )

        with pytest.raises(InvalidSignature):
            raise_from_response(response)

    def test_invalid_signature_in_4xx_body(self):
        response = _make_response(
            400, {"detail": "Invalid signature for typed_data"}
        )

        with pytest.raises(InvalidSignature):
            raise_from_response(response)


class TestFallback:
    def test_unknown_5xx_falls_back_to_hosted_trading_error(self):
        response = _make_response(500, {"detail": "something went wrong"})

        with pytest.raises(HostedTradingError) as exc_info:
            raise_from_response(response)

        # Generic fallback — not one of the named subclasses.
        assert type(exc_info.value) is HostedTradingError
        assert exc_info.value.status == 500

    def test_unknown_4xx_with_no_match_falls_back_to_hosted_trading_error(self):
        response = _make_response(418, {"detail": "I'm a teapot"})

        with pytest.raises(HostedTradingError) as exc_info:
            raise_from_response(response)

        assert type(exc_info.value) is HostedTradingError

    def test_2xx_with_no_error_returns_quietly(self):
        response = _make_response(200, {"success": True, "data": {"foo": "bar"}})

        # Should not raise.
        raise_from_response(response)

    def test_2xx_with_success_false_raises(self):
        response = _make_response(
            200, {"success": False, "error": "Invalid signature: bad value"}
        )

        with pytest.raises(InvalidSignature):
            raise_from_response(response)


class TestMultiInheritanceCatchSites:
    """Confirm legacy ``except`` sites still work in hosted mode."""

    @pytest.mark.parametrize(
        ("status", "payload", "legacy_base"),
        [
            (403, {"detail": "Insufficient escrow balance"}, InsufficientFunds),
            (401, {"detail": "anything"}, AuthenticationError),
            (404, {"detail": "catalog: no outcome"}, NotFoundError),
            (503, {"detail": "catalog: ow"}, ExchangeNotAvailable),
            (410, {"detail": "built_order_id expired"}, InvalidOrder),
            (422, {"detail": "below the minimum"}, InvalidOrder),
            (422, {"detail": "book has no resting asks"}, InvalidOrder),
        ],
    )
    def test_legacy_catch_site_still_catches(self, status, payload, legacy_base):
        response = _make_response(status, payload)

        with pytest.raises(legacy_base):
            raise_from_response(response)
