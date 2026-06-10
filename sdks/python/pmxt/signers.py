"""
Signer helpers for hosted PMXT trading.

This module keeps eth-account as a lazy optional dependency so read-only SDK
users do not need hosted-trading signing packages installed.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

_ETH_ACCOUNT_INSTALL_HINT = 'pip install "pmxt[hosted]"'


@runtime_checkable
class Signer(Protocol):
    """Callable EIP-712 signer used by hosted trading."""

    def __call__(self, typed_data: dict[str, Any]) -> str:
        """Return a 0x-prefixed hex signature for an EIP-712 payload."""
        ...


def _load_eth_account() -> tuple[Any, Any]:
    """Import eth-account only when hosted signing is actually used."""
    try:
        from eth_account import Account
        from eth_account.messages import encode_typed_data
    except ImportError as exc:
        raise ImportError(
            "Hosted PMXT signing requires the optional eth-account dependency. "
            f"Install it with: {_ETH_ACCOUNT_INSTALL_HINT}."
        ) from exc

    return Account, encode_typed_data


class EthAccountSigner:
    """Signer backed by an eth-account local private key."""

    __slots__ = ("_account",)

    def __init__(self, private_key: str) -> None:
        Account, _ = _load_eth_account()
        self._account: Any = Account.from_key(private_key)

    @property
    def address(self) -> str:
        """Checksum wallet address derived from the private key."""
        return self._account.address

    def __call__(self, typed_data: dict[str, Any]) -> str:
        """Sign EIP-712 typed data and return a 0x-prefixed signature."""
        Account, encode_typed_data = _load_eth_account()
        message = encode_typed_data(full_message=typed_data)
        signed = Account.sign_message(message, self._account.key)
        signature = signed.signature.hex()
        return signature if signature.startswith("0x") else f"0x{signature}"

