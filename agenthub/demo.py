"""Demo-tilstand: simulerer realistiske Claude Code-sessioner.

Bruges til at se hubben i aktion uden at have Claude Code kørende,
og til at teste frontend. Hændelserne går gennem præcis samme vej
som rigtige hook-hændelser (HubState.handle_event).
"""

from __future__ import annotations

import asyncio
import random
from typing import Awaitable, Callable

Emit = Callable[[dict], Awaitable[None]]

PROJECTS = [
    ("demo-1", r"C:\Users\dig\projekter\webshop"),
    ("demo-2", r"C:\Users\dig\projekter\data-pipeline"),
    ("demo-3", r"C:\Users\dig\projekter\portfolio"),
    ("demo-4", r"C:\Users\dig\projekter\ml-eksperiment"),
]

PROMPTS = [
    "Tilføj login med e-mail og kodeord",
    "Find og ret fejlen i checkout-flowet",
    "Skriv tests for betalingsmodulet",
    "Refaktorér databaselaget så det bliver lettere at teste",
    "Opdater README med installationsvejledning",
    "Undersøg hvorfor CI fejler på main",
    "Lav en ny forside med hero-sektion",
]

STEPS = [
    ("Read", {"file_path": "src/app.py"}),
    ("Read", {"file_path": "README.md"}),
    ("Grep", {"pattern": "def checkout"}),
    ("Glob", {"pattern": "**/*.tsx"}),
    ("Edit", {"file_path": "src/checkout.py"}),
    ("Edit", {"file_path": "src/components/Hero.tsx"}),
    ("Write", {"file_path": "tests/test_payment.py"}),
    ("Bash", {"command": "pytest -q"}),
    ("Bash", {"command": "npm run build"}),
    ("Bash", {"command": "git status"}),
    ("WebSearch", {"query": "fastapi websocket reconnect best practice"}),
    ("WebFetch", {"url": "https://docs.python.org/3/library/asyncio.html"}),
    ("TodoWrite", {}),
    ("Task", {"description": "Undersøg testdækning"}),
    ("mcp__github__create_pull_request", {}),
]


async def _session(sid: str, cwd: str, emit: Emit, rng: random.Random) -> None:
    base = {"session_id": sid, "cwd": cwd}
    await asyncio.sleep(rng.uniform(0.3, 3.0))
    await emit({**base, "hook_event_name": "SessionStart", "source": "startup"})
    await asyncio.sleep(rng.uniform(2, 5))
    while True:
        await emit({**base, "hook_event_name": "UserPromptSubmit", "prompt": rng.choice(PROMPTS)})
        await asyncio.sleep(rng.uniform(1.5, 3.5))
        for _ in range(rng.randint(4, 9)):
            tool, ti = rng.choice(STEPS)
            await emit({**base, "hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": ti})
            if tool == "Bash" and rng.random() < 0.3:
                await asyncio.sleep(1.0)
                await emit({**base, "hook_event_name": "Notification",
                            "message": "Claude needs your permission to use Bash"})
                await asyncio.sleep(rng.uniform(4, 7))
            await asyncio.sleep(rng.uniform(2.5, 6) if tool != "Task" else rng.uniform(6, 10))
            await emit({**base, "hook_event_name": "PostToolUse", "tool_name": tool})
            await asyncio.sleep(rng.uniform(0.5, 2.0))
        await emit({**base, "hook_event_name": "Stop"})
        await asyncio.sleep(rng.uniform(8, 18))


class Demo:
    def __init__(self, emit: Emit):
        self.emit = emit
        self.tasks: list[asyncio.Task] = []

    @property
    def running(self) -> bool:
        return bool(self.tasks)

    def start(self, count: int = 3) -> None:
        if self.tasks:
            return
        rng = random.Random()
        for sid, cwd in PROJECTS[:count]:
            self.tasks.append(asyncio.create_task(_session(sid, cwd, self.emit, rng)))

    async def stop(self) -> None:
        for t in self.tasks:
            t.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        self.tasks.clear()
        for sid, cwd in PROJECTS:
            await self.emit({"session_id": sid, "cwd": cwd, "hook_event_name": "SessionEnd"})
