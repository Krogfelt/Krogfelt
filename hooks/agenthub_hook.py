"""Claude Code hook -> Agent Hub.

Kaldes af Claude Code ved hver hook-hændelse med JSON på stdin.
Sender en slank udgave til den lokale Agent Hub-server.

Designregler (vigtige!):
  * Kun standardbiblioteket  -> hurtig opstart, ingen venv-krav.
  * Må ALDRIG blokere eller fejle Claude Code: alt er pakket i try/except,
    kort timeout, ingen output på stdout, exit-kode 0 altid.
  * Proxy slås fra, så Windows' systemproxy ikke kaprer 127.0.0.1.
"""

import json
import os
import sys
import urllib.request

PORT = os.environ.get("AGENTHUB_PORT", "8765")
URL = f"http://127.0.0.1:{PORT}/event"
TIMEOUT = 0.8

# Felter fra tool_input som er nyttige at vise (resten smides væk)
KEEP_INPUT = ("file_path", "notebook_path", "command", "pattern", "query",
              "url", "description", "path", "subagent_type")


def _trim(value, limit=300):
    s = str(value)
    return s if len(s) <= limit else s[:limit]


def slim(data):
    out = {
        "session_id": data.get("session_id"),
        "hook_event_name": data.get("hook_event_name"),
        "cwd": data.get("cwd"),
    }
    if data.get("tool_name"):
        out["tool_name"] = data["tool_name"]
    ti = data.get("tool_input")
    if isinstance(ti, dict):
        out["tool_input"] = {k: _trim(ti[k]) for k in KEEP_INPUT if k in ti}
    for key in ("message", "source", "reason"):
        if data.get(key):
            out[key] = _trim(data[key])
    if data.get("prompt"):
        out["prompt"] = _trim(data["prompt"], 200)
    return out


def main():
    try:
        raw = sys.stdin.buffer.read()
        data = json.loads(raw.decode("utf-8", errors="replace") or "{}")
        body = json.dumps(slim(data)).encode("utf-8")
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json"})
        opener.open(req, timeout=TIMEOUT).read()
    except Exception:
        pass  # Hub kører ikke, eller anden fejl: ignorer stille


if __name__ == "__main__":
    main()
    sys.exit(0)
