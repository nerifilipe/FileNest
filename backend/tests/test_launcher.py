"""Launcher ownership and failure behavior, without opening a browser."""
import os
from unittest.mock import Mock

import pytest

from scripts import launch


@pytest.mark.skipif(os.name != "nt", reason="Windows launcher")
def test_occupied_port_is_not_reused_or_terminated():
    import socket
    with socket.socket() as listener:
        try:
            listener.bind(("127.0.0.1", 8000))
            listener.listen()
        except OSError:
            pytest.skip("Port 8000 already occupied")
        with pytest.raises(ValueError, match="ocupada"):
            launch.check_ports()
        assert listener.fileno() != -1


def test_startup_failure_closes_job_and_waits_only_for_owned_children(tmp_path, monkeypatch):
    monkeypatch.setattr(launch, "ROOT", tmp_path)
    monkeypatch.setattr(launch, "check_ports", lambda: None)
    job = Mock()
    monkeypatch.setattr(launch, "ChildJob", lambda: job)
    processes = [Mock(), Mock()]
    monkeypatch.setattr(launch.subprocess, "Popen", Mock(side_effect=processes))
    monkeypatch.setattr(launch.subprocess, "CREATE_NO_WINDOW", 0, raising=False)
    monkeypatch.setattr(launch, "wait_ready", Mock(side_effect=ValueError("failed")))
    browser = Mock()
    monkeypatch.setattr(launch.webbrowser, "open", browser)
    with pytest.raises(ValueError, match="failed"):
        launch.launch("node", tmp_path / "vite.js")
    job.close.assert_called_once()
    assert job.add.call_count == 2
    for process in processes:
        process.wait.assert_called_once_with(timeout=10)
    browser.assert_not_called()
