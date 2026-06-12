"""Tests for hosted escrow transaction body helpers."""

from __future__ import annotations

import importlib.util
import pathlib
import sys
import types


def _load_escrow_module():
    """Load pmxt.escrow without importing pmxt.__init__.

    The generated pmxt_internal package is not checked in, and pmxt.__init__
    imports the full client. These helper-level tests only need sibling pmxt
    modules, so install a minimal package shell and load escrow directly.
    """
    package_root = pathlib.Path(__file__).resolve().parents[1] / "pmxt"
    pkg = types.ModuleType("pmxt")
    pkg.__path__ = [str(package_root)]
    sys.modules.setdefault("pmxt", pkg)
    spec = importlib.util.spec_from_file_location(
        "pmxt.escrow",
        package_root / "escrow.py",
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["pmxt.escrow"] = module
    spec.loader.exec_module(module)
    return module


def test_approval_amount_wei_serializes_as_string_for_json_wire_format():
    escrow = _load_escrow_module()

    assert escrow._amount_wei(2**96 - 1) == str(2**96 - 1)
