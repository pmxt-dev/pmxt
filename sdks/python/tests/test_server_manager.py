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
