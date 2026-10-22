"""Validation-order tests for ``Escrow.withdrawals``.

The TypeScript SDK resolves the wallet address before validating
``include``; the Python SDK must raise the same error for the same inputs
(see pmxt-dev/pmxt#2353).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict

import pytest

import pmxt.escrow as escrow_module
from pmxt._hosted_errors import MissingWalletAddress
from pmxt.errors import ValidationError
from pmxt.escrow import Escrow

WALLET_ADDRESS = "0x000000000000000000000000000000000000aBc1"


def test_missing_wallet_address_is_checked_before_empty_include() -> None:
    escrow = Escrow(SimpleNamespace(wallet_address=None))

    with pytest.raises(MissingWalletAddress):
        escrow.withdrawals(include="")


def test_empty_include_raises_validation_error_when_address_resolves() -> None:
    escrow = Escrow(SimpleNamespace(wallet_address=WALLET_ADDRESS))

    with pytest.raises(ValidationError) as exc_info:
        escrow.withdrawals(include="   ")
    assert exc_info.value.field == "include"


def test_withdrawals_builds_request_path(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: Dict[str, Any] = {}

    def fake_trading_request(client: Any, *, method: str, path: str, body: Any) -> Dict[str, Any]:
        calls.update(method=method, path=path, body=body)
        return {"ok": True}

    monkeypatch.setattr(escrow_module, "_trading_request", fake_trading_request)
    escrow = Escrow(SimpleNamespace(wallet_address=None))

    assert escrow.withdrawals(include=" pending ", address=WALLET_ADDRESS) == {"ok": True}
    assert calls == {
        "method": "GET",
        "path": f"/v0/escrow/{WALLET_ADDRESS}/withdrawals?include=pending",
        "body": None,
    }
