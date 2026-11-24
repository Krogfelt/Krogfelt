"""Installer/afinstaller Agent Hub hooks i Claude Code's bruger-indstillinger.

    python -m agenthub.install              # installer (alle projekter)
    python -m agenthub.install --uninstall  # fjern igen
    python -m agenthub.install --dry-run    # vis hvad der ville ske

Sikkerhed:
  * Eksisterende hooks og indstillinger bevares – vi tilføjer kun vores egne.
  * Der tages backup af settings.json før hver ændring.
  * Kørsel er idempotent: vores gamle poster fjernes før nye tilføjes.
  * Ugyldig JSON i settings.json -> vi stopper uden at røre filen.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

MARKER = "agenthub_hook.py"
HOOK_SCRIPT = Path(__file__).resolve().parent.parent / "hooks" / MARKER

# (hændelse, matcher) – matcher=None betyder "ingen matcher-nøgle"
EVENTS: list[tuple[str, str | None]] = [
    ("SessionStart", None),
    ("SessionEnd", None),
    ("UserPromptSubmit", None),
    ("PreToolUse", "*"),
    ("PostToolUse", "*"),
    ("Notification", None),
    ("Stop", None),
]


def default_settings_path() -> Path:
    return Path.home() / ".claude" / "settings.json"


def hook_command(python: str | None = None, script: Path | None = None) -> str:
    # Forward slashes virker både i cmd.exe og Git Bash på Windows
    py = (python or sys.executable).replace("\\", "/")
    sc = str(script or HOOK_SCRIPT).replace("\\", "/")
    return f'"{py}" "{sc}"'


def _is_ours(entry: dict) -> bool:
    return any(MARKER in str(h.get("command", "")) for h in entry.get("hooks", []))


def remove_ours(settings: dict) -> dict:
    hooks = settings.get("hooks")
    if not isinstance(hooks, dict):
        return settings
    for event in list(hooks):
        entries = hooks[event]
        if not isinstance(entries, list):
            continue
        kept = [e for e in entries if not (isinstance(e, dict) and _is_ours(e))]
        if kept:
            hooks[event] = kept
        else:
            del hooks[event]
    if not hooks:
        settings.pop("hooks", None)
    return settings


def add_ours(settings: dict, command: str) -> dict:
    settings = remove_ours(settings)
    hooks = settings.setdefault("hooks", {})
    for event, matcher in EVENTS:
        entry: dict = {"hooks": [{"type": "command", "command": command, "timeout": 5}]}
        if matcher is not None:
            entry = {"matcher": matcher, **entry}
        hooks.setdefault(event, []).append(entry)
    return settings


def load(path: Path) -> dict:
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return {}
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("settings.json er ikke et JSON-objekt")
    return data


def save(path: Path, data: dict) -> Path | None:
    path.parent.mkdir(parents=True, exist_ok=True)
    backup = None
    if path.exists():
        backup = path.with_name(f"{path.name}.agenthub-backup-{time.strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(path, backup)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return backup


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--uninstall", action="store_true", help="fjern Agent Hub hooks")
    ap.add_argument("--dry-run", action="store_true", help="vis resultatet uden at gemme")
    ap.add_argument("--settings", type=Path, default=default_settings_path(), help="sti til settings.json")
    args = ap.parse_args(argv)

    try:
        settings = load(args.settings)
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"FEJL: kunne ikke læse {args.settings}: {exc}\nFilen er ikke ændret.")
        return 1

    if args.uninstall:
        result = remove_ours(settings)
        action = "fjernet"
    else:
        if not HOOK_SCRIPT.exists():
            print(f"FEJL: hook-scriptet findes ikke: {HOOK_SCRIPT}")
            return 1
        result = add_ours(settings, hook_command())
        action = "installeret"

    if args.dry_run:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0

    backup = save(args.settings, result)
    print(f"✓ Agent Hub hooks {action} i {args.settings}")
    if backup:
        print(f"  Backup: {backup}")
    if not args.uninstall:
        print(f"  Hook-kommando: {hook_command()}")
        print("  Genstart kørende Claude Code-sessioner, så de opfanger ændringen.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
