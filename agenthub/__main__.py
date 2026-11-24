"""Start Agent Hub:  python -m agenthub  [--demo] [--browser] [--port 8765]

Rækkefølge for vinduet:
  1. pywebview (ægte Windows-vindue via Edge WebView2)  – anbefalet
  2. Microsoft Edge / Chrome i "app-tilstand" (vindue uden browser-UI)
  3. Standardbrowseren
"""

from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

TITLE = "Agent Hub"


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def start_server(port: int, demo: bool):
    import uvicorn

    from .server import create_app

    config = uvicorn.Config(create_app(start_demo=demo), host="127.0.0.1", port=port,
                            log_level="warning", loop="asyncio")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True, name="agenthub-server")
    thread.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    return server, thread


def find_app_browser() -> str | None:
    candidates = []
    if os.name == "nt":
        for env in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"):
            base = os.environ.get(env)
            if base:
                candidates += [
                    Path(base) / "Microsoft/Edge/Application/msedge.exe",
                    Path(base) / "Google/Chrome/Application/chrome.exe",
                ]
    for c in candidates:
        if c.exists():
            return str(c)
    for name in ("msedge", "google-chrome", "chromium", "chromium-browser", "chrome"):
        found = shutil.which(name)
        if found:
            return found
    return None


def open_pywebview(url: str) -> bool:
    try:
        import webview  # pywebview
    except Exception as exc:
        print(f"[agenthub] pywebview ikke tilgængelig ({exc}); prøver app-browser.")
        return False
    try:
        webview.create_window(TITLE, url, width=1600, height=960, min_size=(900, 600),
                              background_color="#20183a", text_select=False)
        webview.start()  # blokerer til vinduet lukkes
        return True
    except Exception as exc:
        print(f"[agenthub] pywebview kunne ikke starte ({exc}); prøver app-browser.")
        return False


def open_app_browser(url: str) -> bool:
    exe = find_app_browser()
    if not exe:
        return False
    profile = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "AgentHub" / "browser-profile"
    profile.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen([exe, f"--app={url}", "--window-size=1600,960",
                             f"--user-data-dir={profile}", "--no-first-run"])
    proc.wait()  # med egen profil afsluttes processen når vinduet lukkes
    return True


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="agenthub", description="Agent Hub – 3D dashboard for Claude Code")
    ap.add_argument("--port", type=int, default=int(os.environ.get("AGENTHUB_PORT", 8765)))
    ap.add_argument("--demo", action="store_true", help="start med simulerede agenter")
    ap.add_argument("--browser", action="store_true", help="brug browser-app i stedet for pywebview")
    ap.add_argument("--server-only", action="store_true", help="kør kun serveren (intet vindue)")
    args = ap.parse_args(argv)

    url = f"http://127.0.0.1:{args.port}/"

    server = None
    if port_in_use(args.port):
        print(f"[agenthub] Server kører allerede på port {args.port} – åbner kun vinduet.")
    else:
        server, thread = start_server(args.port, args.demo)
        if not server.started:
            print("[agenthub] FEJL: serveren startede ikke. Er porten optaget?")
            return 1
        print(f"[agenthub] Server kører på {url}")

    try:
        if args.server_only:
            print("[agenthub] Kun server. Stop med Ctrl+C.")
            while True:
                time.sleep(1)
        opened = (not args.browser and open_pywebview(url)) or open_app_browser(url)
        if not opened:
            webbrowser.open(url)
            print("[agenthub] Åbnet i standardbrowseren. Stop med Ctrl+C.")
            while True:
                time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        if server:
            server.should_exit = True
            time.sleep(0.3)
    return 0


if __name__ == "__main__":
    sys.exit(main())
