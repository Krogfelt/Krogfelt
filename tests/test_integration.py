import json
import os
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from agenthub import install
from agenthub.server import create_app

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "hooks" / "agenthub_hook.py"


def test_server_event_to_websocket():
    with TestClient(create_app()) as client:
        with client.websocket_connect("/ws") as ws:
            snap = ws.receive_json()
            assert snap["type"] == "snapshot" and snap["agents"] == []
            r = client.post("/event", json={"session_id": "a", "hook_event_name": "SessionStart", "cwd": "/x/proj"})
            assert r.json() == {"ok": True}
            msg = ws.receive_json()
            assert msg["type"] == "agent" and msg["agent"]["name"] == "proj"
        assert client.get("/").status_code == 200
        assert client.post("/event", content=b"not json").status_code == 400


def test_hook_script_never_fails_without_server():
    payload = json.dumps({"session_id": "a", "hook_event_name": "Stop"})
    r = subprocess.run([sys.executable, str(HOOK)], input=payload.encode(), capture_output=True, timeout=10,
                       env={**os.environ, "AGENTHUB_PORT": "1"})
    assert r.returncode == 0 and r.stdout == b""


def test_hook_slim_drops_large_fields():
    sys.path.insert(0, str(HOOK.parent))
    import agenthub_hook

    out = agenthub_hook.slim({
        "session_id": "a", "hook_event_name": "PostToolUse", "tool_name": "Read",
        "tool_input": {"file_path": "x.py", "content": "y" * 10000},
        "tool_response": {"content": "z" * 10000},
    })
    assert "tool_response" not in out and out["tool_input"] == {"file_path": "x.py"}


def test_install_merges_and_uninstalls(tmp_path):
    settings = tmp_path / "settings.json"
    original = {
        "model": "opus",
        "hooks": {"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "my-guard"}]}]},
    }
    settings.write_text(json.dumps(original))

    assert install.main(["--settings", str(settings)]) == 0
    assert install.main(["--settings", str(settings)]) == 0  # idempotent
    data = json.loads(settings.read_text())
    assert data["model"] == "opus"
    pre = data["hooks"]["PreToolUse"]
    assert pre[0]["hooks"][0]["command"] == "my-guard"
    assert sum(install.MARKER in e["hooks"][0]["command"] for e in pre) == 1
    assert set(data["hooks"]) == {e for e, _ in install.EVENTS}
    assert list(tmp_path.glob("settings.json.agenthub-backup-*"))

    assert install.main(["--settings", str(settings), "--uninstall"]) == 0
    assert json.loads(settings.read_text()) == original


def test_install_refuses_invalid_json(tmp_path):
    settings = tmp_path / "settings.json"
    settings.write_text("{ broken")
    assert install.main(["--settings", str(settings)]) == 1
    assert settings.read_text() == "{ broken"
