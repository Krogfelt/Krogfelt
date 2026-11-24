"""Hub-tilstand: oversætter Claude Code hook-hændelser til agent-aktiviteter.

Denne fil er hjertet i systemet og har ingen afhængigheder til web/GUI,
så den kan testes isoleret (se tests/test_state.py).

Flow:  hook-hændelse (dict)  ->  HubState.handle_event()  ->  liste af opdateringer
       tidsbaseret oprydning ->  HubState.tick()          ->  liste af opdateringer

En "opdatering" er en dict der sendes direkte til frontend via WebSocket:
    {"type": "agent",  "agent": {...}}
    {"type": "remove", "id": "..."}
    {"type": "log",    "entry": {...}}
"""

from __future__ import annotations

import hashlib
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Any

MAX_SLOTS = 8  # antal arbejdsstationer i hubben

# ---------------------------------------------------------------------------
# Mapping fra Claude Code værktøj -> aktivitet (styrer animation + skærm)
# ---------------------------------------------------------------------------
TOOL_ACTIVITY: dict[str, str] = {
    "Edit": "coding",
    "MultiEdit": "coding",
    "Write": "coding",
    "NotebookEdit": "coding",
    "Bash": "terminal",
    "PowerShell": "terminal",
    "BashOutput": "terminal",
    "KillShell": "terminal",
    "KillBash": "terminal",
    "Read": "reading",
    "NotebookRead": "reading",
    "Grep": "exploring",
    "Glob": "exploring",
    "LS": "exploring",
    "WebSearch": "browsing",
    "WebFetch": "browsing",
    "TodoWrite": "planning",
    "ExitPlanMode": "planning",
    "EnterPlanMode": "planning",
    "TaskCreate": "planning",
    "TaskUpdate": "planning",
    "Task": "delegating",
    "Agent": "delegating",
}
DELEGATE_TOOLS = {"Task", "Agent"}
EDIT_TOOLS = {"Edit", "MultiEdit", "Write", "NotebookEdit"}

# Aktiviteter hvor agenten står ved sin arbejdsstation
STATION_ACTIVITIES = {
    "thinking", "coding", "terminal", "reading", "exploring",
    "browsing", "planning", "delegating", "tool",
}
TOOL_ACTIVITIES = STATION_ACTIVITIES - {"thinking"}

ACTIVITY_VERB = {
    "coding": "koder",
    "terminal": "kører",
    "reading": "læser",
    "exploring": "leder i koden",
    "browsing": "søger på nettet",
    "planning": "planlægger",
    "delegating": "sender en hjælper afsted",
    "tool": "bruger værktøj",
}

SPECIES = ["mochi", "pip", "sprout", "zap", "puff", "bub"]
COLORS = [
    "#ff9ec7",  # rosa
    "#8fd3ff",  # himmelblå
    "#ffd36e",  # solgul
    "#a8e6a1",  # mint
    "#c9a7ff",  # lavendel
    "#ffb38a",  # fersken
    "#7fe0d4",  # turkis
    "#ff8f8f",  # koral
]

# Tidsgrænser (sekunder)
THINK_AFTER_TOOL = 8      # efter PostToolUse uden ny hændelse -> "tænker"
SLEEP_AFTER_IDLE = 600    # færdig/ledig så længe -> sover
REMOVE_AFTER = 3 * 3600   # ingen hændelser så længe -> fjernes


def _hash_int(text: str) -> int:
    return int(hashlib.md5(text.encode("utf-8")).hexdigest()[:8], 16)


def project_name(cwd: str | None) -> str:
    if not cwd:
        return "ukendt"
    parts = [p for p in cwd.replace("\\", "/").split("/") if p and not p.endswith(":")]
    return parts[-1] if parts else cwd


def _short(text: Any, limit: int = 80) -> str:
    s = " ".join(str(text or "").split())
    return s if len(s) <= limit else s[: limit - 1] + "…"


def _basename(path: str) -> str:
    return path.replace("\\", "/").rstrip("/").split("/")[-1] or path


def tool_detail(tool: str, tool_input: dict | None) -> str:
    """Kort, menneskelig beskrivelse af hvad værktøjet arbejder på."""
    ti = tool_input or {}
    for key in ("file_path", "notebook_path"):
        if ti.get(key):
            return _basename(str(ti[key]))
    if ti.get("command"):
        return _short(ti["command"], 70)
    if ti.get("description") and tool in DELEGATE_TOOLS:
        return _short(ti["description"], 60)
    if ti.get("pattern"):
        return _short(ti["pattern"], 50)
    if ti.get("query"):
        return _short(ti["query"], 60)
    if ti.get("url"):
        url = str(ti["url"]).split("://", 1)[-1]
        return _short(url.split("/", 1)[0], 50)
    if ti.get("path"):
        return _basename(str(ti["path"]))
    if tool.startswith("mcp__"):
        return _short(tool.split("__", 2)[-1].replace("_", " "), 50)
    return tool


@dataclass
class Agent:
    id: str
    name: str
    project: str
    cwd: str
    species: str
    color: str
    slot: int | None
    activity: str = "idle"
    detail: str = ""
    waiting: bool = False
    waiting_kind: str = ""        # "permission" | "input"
    helpers: int = 0              # aktive subagenter
    tool_count: int = 0
    edit_count: int = 0
    last_prompt: str = ""
    started: float = field(default_factory=time.time)
    last_event: float = field(default_factory=time.time)
    activity_since: float = field(default_factory=time.time)
    last_event_kind: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class HubState:
    def __init__(self, max_slots: int = MAX_SLOTS, log_size: int = 200):
        self.max_slots = max_slots
        self.agents: dict[str, Agent] = {}
        self.log: deque[dict] = deque(maxlen=log_size)

    # ------------------------------------------------------------------ helpers
    def snapshot(self) -> dict:
        return {
            "type": "snapshot",
            "agents": [a.to_dict() for a in self.agents.values()],
            "log": list(self.log),
            "server_time": time.time(),
        }

    def _free_slot(self) -> int | None:
        used = {a.slot for a in self.agents.values()}
        for i in range(self.max_slots):
            if i not in used:
                return i
        return None

    def _pick_color(self, seed: int) -> str:
        used = {a.color for a in self.agents.values()}
        for i in range(len(COLORS)):
            c = COLORS[(seed + i) % len(COLORS)]
            if c not in used:
                return c
        return COLORS[seed % len(COLORS)]

    def _unique_name(self, base: str) -> str:
        names = {a.name for a in self.agents.values()}
        if base not in names:
            return base
        n = 2
        while f"{base} {n}" in names:
            n += 1
        return f"{base} {n}"

    def _get_or_create(self, sid: str, cwd: str, now: float) -> tuple[Agent, bool]:
        agent = self.agents.get(sid)
        if agent:
            if cwd and not agent.cwd:
                agent.cwd = cwd
            return agent, False
        seed = _hash_int(sid)
        project = project_name(cwd)
        agent = Agent(
            id=sid,
            name=self._unique_name(project),
            project=project,
            cwd=cwd or "",
            species=SPECIES[seed % len(SPECIES)],
            color=self._pick_color(seed),
            slot=self._free_slot(),
            started=now,
            last_event=now,
            activity_since=now,
        )
        self.agents[sid] = agent
        return agent, True

    def _set_activity(self, agent: Agent, activity: str, now: float) -> None:
        if agent.activity != activity:
            agent.activity = activity
            agent.activity_since = now

    def _log(self, agent: Agent, kind: str, text: str, now: float) -> dict:
        entry = {
            "t": now,
            "agent_id": agent.id,
            "name": agent.name,
            "color": agent.color,
            "kind": kind,
            "text": text,
        }
        self.log.append(entry)
        return {"type": "log", "entry": entry}

    # ------------------------------------------------------------------ events
    def handle_event(self, ev: dict, now: float | None = None) -> list[dict]:
        now = time.time() if now is None else now
        sid = str(ev.get("session_id") or "").strip()
        kind = str(ev.get("hook_event_name") or "").strip()
        if not sid or not kind:
            return []

        out: list[dict] = []

        if kind == "SessionEnd":
            agent = self.agents.pop(sid, None)
            if agent:
                out.append(self._log(agent, "leave", "forlod hubben", now))
                out.append({"type": "remove", "id": sid})
            return out

        agent, created = self._get_or_create(sid, str(ev.get("cwd") or ""), now)
        agent.last_event = now
        agent.last_event_kind = kind
        if created:
            out.append(self._log(agent, "join", "dukkede op i hubben", now))

        if kind == "SessionStart":
            agent.waiting = False
            if not created:
                self._set_activity(agent, "idle", now)

        elif kind == "UserPromptSubmit":
            prompt = _short(ev.get("prompt"), 90)
            agent.last_prompt = prompt
            agent.detail = prompt
            agent.waiting = False
            self._set_activity(agent, "thinking", now)
            out.append(self._log(agent, "prompt", f"fik en opgave: «{prompt}»" if prompt else "fik en opgave", now))

        elif kind == "PreToolUse":
            tool = str(ev.get("tool_name") or "")
            activity = TOOL_ACTIVITY.get(tool, "tool")
            agent.detail = tool_detail(tool, ev.get("tool_input"))
            agent.waiting = False
            agent.tool_count += 1
            if tool in EDIT_TOOLS:
                agent.edit_count += 1
            if tool in DELEGATE_TOOLS:
                agent.helpers += 1
            self._set_activity(agent, activity, now)
            out.append(self._log(agent, activity, f"{ACTIVITY_VERB.get(activity, 'arbejder')}: {agent.detail}", now))

        elif kind == "PostToolUse":
            tool = str(ev.get("tool_name") or "")
            if tool in DELEGATE_TOOLS:
                agent.helpers = max(0, agent.helpers - 1)
            if agent.waiting:
                agent.waiting = False
                if agent.activity == "waiting":
                    self._set_activity(agent, TOOL_ACTIVITY.get(tool, "tool"), now)

        elif kind == "Notification":
            msg = _short(ev.get("message"), 120)
            permission = "permission" in msg.lower() or "tilladelse" in msg.lower()
            agent.waiting = True
            agent.waiting_kind = "permission" if permission else "input"
            agent.detail = msg
            self._set_activity(agent, "waiting", now)
            text = "venter på din tilladelse" if permission else "venter på dit svar"
            out.append(self._log(agent, "waiting", f"{text}: {msg}" if msg else text, now))

        elif kind == "Stop":
            agent.waiting = False
            agent.helpers = 0
            agent.detail = agent.last_prompt
            self._set_activity(agent, "done", now)
            out.append(self._log(agent, "done", "er færdig 🎉", now))

        elif kind == "SubagentStop":
            pass  # håndteres via PostToolUse for Task/Agent

        else:
            # Ukendt hændelsestype: opdater kun "sidst set"
            pass

        # Agent-opdateringen skal altid før log-linjerne, så frontend kender agenten
        return [{"type": "agent", "agent": agent.to_dict()}, *out]

    # ------------------------------------------------------------------ tick
    def tick(self, now: float | None = None) -> list[dict]:
        now = time.time() if now is None else now
        out: list[dict] = []
        for sid, agent in list(self.agents.items()):
            idle_for = now - agent.last_event
            if idle_for > REMOVE_AFTER:
                del self.agents[sid]
                out.append({"type": "remove", "id": sid})
                continue
            changed = False
            if (
                agent.activity in TOOL_ACTIVITIES
                and agent.last_event_kind == "PostToolUse"
                and idle_for > THINK_AFTER_TOOL
            ):
                self._set_activity(agent, "thinking", now)
                changed = True
            elif agent.activity in ("done", "idle") and idle_for > SLEEP_AFTER_IDLE and not agent.waiting:
                self._set_activity(agent, "sleeping", now)
                changed = True
            if changed:
                out.append({"type": "agent", "agent": agent.to_dict()})
        return out
