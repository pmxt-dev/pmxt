import logging
import urllib.error

import pytest

from pmxt.server_manager import ServerManager


def test_health_requires_current_home_lock(monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    manager = ServerManager()
    monkeypatch.setattr(manager, "_check_health", lambda port, timeout=2: True)

    assert manager.health() is False


def test_wait_for_health_requires_current_home_lock(monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    manager = ServerManager()
    manager.HEALTH_CHECK_TIMEOUT = 0.01
    manager.HEALTH_CHECK_INTERVAL = 0.001
    monkeypatch.setattr(manager, "_check_health", lambda port, timeout=2: True)

    with pytest.raises(Exception, match="Server failed to become healthy"):
        manager._wait_for_health()


def test_check_health_logs_expected_request_failures(monkeypatch, caplog):
    manager = ServerManager()

    def fail_request(*args, **kwargs):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr("pmxt.server_manager.urllib.request.urlopen", fail_request)

    with caplog.at_level(logging.DEBUG, logger="pmxt.server_manager"):
        assert manager._check_health(3847) is False

    assert "Health check failed for port 3847" in caplog.text


def test_check_health_does_not_mask_unexpected_errors(monkeypatch):
    manager = ServerManager()

    def fail_request(*args, **kwargs):
        raise RuntimeError("unexpected failure")

    monkeypatch.setattr("pmxt.server_manager.urllib.request.urlopen", fail_request)

    with pytest.raises(RuntimeError, match="unexpected failure"):
        manager._check_health(3847)
