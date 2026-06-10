"""Tests for hosted-mode EIP-712 signers."""

import importlib
import sys
from typing import Any, Callable, Dict, List, Tuple

import pytest

import pmxt.signers as signers_module
from pmxt.signers import EthAccountSigner, Signer


TEST_PRIVATE_KEY = "0x" + ("0" * 63) + "1"
EXPECTED_TEST_ADDRESS = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"
VERIFYING_CONTRACT = "0x1111111111111111111111111111111111111111"
COUNTERPARTY = "0x2222222222222222222222222222222222222222"
ORDER_ID = "0x" + ("ab" * 32)
PULL_ID = "0x" + ("cd" * 32)


class _BlockEthAccountFinder:
    def find_spec(self, fullname: str, path: object = None, target: object = None) -> None:
        if fullname == "eth_account" or fullname.startswith("eth_account."):
            raise ModuleNotFoundError("No module named 'eth_account'")
        return None


def _eth_account_tools() -> Tuple[Any, Callable[..., Any]]:
    eth_account = pytest.importorskip("eth_account")
    eth_account_messages = pytest.importorskip("eth_account.messages")
    return eth_account.Account, eth_account_messages.encode_typed_data


def _domain() -> Dict[str, Any]:
    return {
        "name": "PMXT Hosted Trading",
        "version": "1",
        "chainId": 137,
        "verifyingContract": VERIFYING_CONTRACT,
    }


def _domain_type() -> List[Dict[str, str]]:
    return [
        {"name": "name", "type": "string"},
        {"name": "version", "type": "string"},
        {"name": "chainId", "type": "uint256"},
        {"name": "verifyingContract", "type": "address"},
    ]


def _typed_data(
    primary_type: str,
    fields: List[Dict[str, str]],
    message: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "types": {
            "EIP712Domain": _domain_type(),
            primary_type: fields,
        },
        "primaryType": primary_type,
        "domain": _domain(),
        "message": message,
    }


def _order_params_typed_data() -> Dict[str, Any]:
    return _typed_data(
        "OrderParams",
        [
            {"name": "user", "type": "address"},
            {"name": "marketId", "type": "string"},
            {"name": "tokenId", "type": "uint256"},
            {"name": "side", "type": "string"},
            {"name": "amount6Dec", "type": "uint256"},
            {"name": "worstPrice6Dec", "type": "uint256"},
            {"name": "nonce", "type": "uint256"},
            {"name": "deadline", "type": "uint256"},
        ],
        {
            "user": EXPECTED_TEST_ADDRESS,
            "marketId": "polymarket:btc-100k-2026",
            "tokenId": 123456789,
            "side": "buy",
            "amount6Dec": 5_000_000,
            "worstPrice6Dec": 620_000,
            "nonce": 1,
            "deadline": 1_893_456_000,
        },
    )


def _cross_chain_order_params_typed_data() -> Dict[str, Any]:
    return _typed_data(
        "CrossChainOrderParams",
        [
            {"name": "user", "type": "address"},
            {"name": "recipient", "type": "address"},
            {"name": "marketId", "type": "string"},
            {"name": "opinionMarketId", "type": "uint256"},
            {"name": "tokenId", "type": "uint256"},
            {"name": "shares6Dec", "type": "uint256"},
            {"name": "maxCostUsdc", "type": "uint256"},
            {"name": "sourceChainId", "type": "uint256"},
            {"name": "destinationChainId", "type": "uint256"},
            {"name": "deadline", "type": "uint256"},
        ],
        {
            "user": EXPECTED_TEST_ADDRESS,
            "recipient": COUNTERPARTY,
            "marketId": "opinion:eth-5000-2026",
            "opinionMarketId": 987_654,
            "tokenId": 987654321,
            "shares6Dec": 2_500_000,
            "maxCostUsdc": 1_400_000,
            "sourceChainId": 56,
            "destinationChainId": 137,
            "deadline": 1_893_456_100,
        },
    )


def _cancel_order_typed_data() -> Dict[str, Any]:
    return _typed_data(
        "CancelOrder",
        [
            {"name": "user", "type": "address"},
            {"name": "orderId", "type": "bytes32"},
            {"name": "nonce", "type": "uint256"},
            {"name": "deadline", "type": "uint256"},
        ],
        {
            "user": EXPECTED_TEST_ADDRESS,
            "orderId": ORDER_ID,
            "nonce": 2,
            "deadline": 1_893_456_200,
        },
    )


def _cancel_pull_typed_data() -> Dict[str, Any]:
    return _typed_data(
        "CancelPull",
        [
            {"name": "user", "type": "address"},
            {"name": "pullId", "type": "bytes32"},
            {"name": "orderId", "type": "bytes32"},
            {"name": "sourceChainId", "type": "uint256"},
            {"name": "nonce", "type": "uint256"},
            {"name": "deadline", "type": "uint256"},
        ],
        {
            "user": EXPECTED_TEST_ADDRESS,
            "pullId": PULL_ID,
            "orderId": ORDER_ID,
            "sourceChainId": 56,
            "nonce": 3,
            "deadline": 1_893_456_300,
        },
    )


TYPED_DATA_BY_PRIMARY_TYPE = {
    "OrderParams": _order_params_typed_data,
    "CrossChainOrderParams": _cross_chain_order_params_typed_data,
    "CancelOrder": _cancel_order_typed_data,
    "CancelPull": _cancel_pull_typed_data,
}


def _sign_typed_data(signer: Any, typed_data: Dict[str, Any]) -> str:
    if hasattr(signer, "sign_typed_data"):
        return signer.sign_typed_data(typed_data)
    if hasattr(signer, "sign"):
        return signer.sign(typed_data)
    return signer(typed_data)


def _recover_address(typed_data: Dict[str, Any], signature: str) -> str:
    Account, encode_typed_data = _eth_account_tools()
    signable_message = encode_typed_data(full_message=typed_data)
    return Account.recover_message(signable_message, signature=signature)


def _assert_signature_shape(signature: str) -> None:
    assert isinstance(signature, str)
    assert signature.startswith("0x")
    assert len(signature) == 132
    try:
        int(signature[2:], 16)
    except ValueError:
        pytest.fail("signature is not hex-encoded")


def test_eth_account_signer_raises_helpful_import_error_without_eth_account(monkeypatch):
    blocked_module_names = tuple(
        name for name in sys.modules if name == "eth_account" or name.startswith("eth_account.")
    )

    try:
        with monkeypatch.context() as blocked:
            for module_name in blocked_module_names:
                blocked.delitem(sys.modules, module_name, raising=False)
            blocked.setattr(
                sys,
                "meta_path",
                [_BlockEthAccountFinder()] + list(sys.meta_path),
            )
            reloaded_signers = importlib.reload(signers_module)

            with pytest.raises(ImportError, match=r'pip install "pmxt\[hosted\]"'):
                reloaded_signers.EthAccountSigner(TEST_PRIVATE_KEY)
    finally:
        importlib.reload(signers_module)


def test_signing_known_typed_data_recovers_expected_wallet_address():
    Account, _ = _eth_account_tools()
    assert Account.from_key(TEST_PRIVATE_KEY).address == EXPECTED_TEST_ADDRESS

    typed_data = _order_params_typed_data()
    signature = _sign_typed_data(EthAccountSigner(TEST_PRIVATE_KEY), typed_data)

    _assert_signature_shape(signature)
    assert _recover_address(typed_data, signature) == EXPECTED_TEST_ADDRESS


@pytest.mark.parametrize("primary_type", tuple(TYPED_DATA_BY_PRIMARY_TYPE.keys()))
def test_each_primary_type_round_trips_through_sign_and_recover(primary_type: str):
    _eth_account_tools()
    typed_data = TYPED_DATA_BY_PRIMARY_TYPE[primary_type]()
    signature = _sign_typed_data(EthAccountSigner(TEST_PRIVATE_KEY), typed_data)

    _assert_signature_shape(signature)
    assert typed_data["primaryType"] == primary_type
    assert _recover_address(typed_data, signature) == EXPECTED_TEST_ADDRESS


def test_eth_account_signer_address_matches_account_from_key():
    Account, _ = _eth_account_tools()

    assert EthAccountSigner(TEST_PRIVATE_KEY).address == Account.from_key(TEST_PRIVATE_KEY).address


def test_eth_account_signer_satisfies_signer_protocol_structurally():
    _eth_account_tools()

    assert isinstance(EthAccountSigner(TEST_PRIVATE_KEY), Signer)
