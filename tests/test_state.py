from agenthub.state import MAX_SLOTS, SLEEP_AFTER_IDLE, THINK_AFTER_TOOL, HubState, project_name, tool_detail


def ev(kind, sid="s1", cwd=r"C:\Users\x\projekter\webshop", **kw):
    return {"session_id": sid, "hook_event_name": kind, "cwd": cwd, **kw}


def agent(state, sid="s1"):
    return state.agents[sid]


def test_project_name_handles_windows_and_posix():
    assert project_name(r"C:\Users\x\projekter\webshop") == "webshop"
    assert project_name("/home/x/app/") == "app"
    assert project_name("C:\\") == "C:\\"
    assert project_name(None) == "ukendt"


def test_session_lifecycle():
    s = HubState()
    out = s.handle_event(ev("SessionStart"), now=0)
    assert out[0]["type"] == "agent"
    a = agent(s)
    assert a.name == "webshop" and a.activity == "idle" and a.slot == 0

    s.handle_event(ev("UserPromptSubmit", prompt="Byg login"), now=1)
    assert a.activity == "thinking" and a.last_prompt == "Byg login"

    s.handle_event(ev("PreToolUse", tool_name="Edit", tool_input={"file_path": r"C:\p\src\app.py"}), now=2)
    assert a.activity == "coding" and a.detail == "app.py" and a.edit_count == 1

    s.handle_event(ev("PreToolUse", tool_name="Bash", tool_input={"command": "pytest -q"}), now=3)
    assert a.activity == "terminal" and a.detail == "pytest -q"

    s.handle_event(ev("Stop"), now=4)
    assert a.activity == "done" and a.tool_count == 2

    out = s.handle_event(ev("SessionEnd"), now=5)
    assert "s1" not in s.agents
    assert {"type": "remove", "id": "s1"} in out


def test_unknown_session_is_created_implicitly():
    s = HubState()
    s.handle_event(ev("PreToolUse", tool_name="Read", tool_input={"file_path": "a/b.md"}), now=0)
    assert agent(s).activity == "reading"


def test_permission_waiting_and_resume():
    s = HubState()
    s.handle_event(ev("PreToolUse", tool_name="Bash", tool_input={"command": "rm x"}), now=0)
    s.handle_event(ev("Notification", message="Claude needs your permission to use Bash"), now=1)
    a = agent(s)
    assert a.waiting and a.waiting_kind == "permission" and a.activity == "waiting"
    s.handle_event(ev("PostToolUse", tool_name="Bash"), now=2)
    assert not a.waiting and a.activity == "terminal"


def test_idle_input_notification():
    s = HubState()
    s.handle_event(ev("Stop"), now=0)
    s.handle_event(ev("Notification", message="Claude is waiting for your input"), now=60)
    assert agent(s).waiting_kind == "input"


def test_helpers_count_for_subagents():
    s = HubState()
    s.handle_event(ev("PreToolUse", tool_name="Task", tool_input={"description": "Find fejl"}), now=0)
    s.handle_event(ev("PreToolUse", tool_name="Agent", tool_input={"description": "Skriv tests"}), now=0)
    assert agent(s).helpers == 2 and agent(s).activity == "delegating"
    s.handle_event(ev("PostToolUse", tool_name="Task"), now=1)
    assert agent(s).helpers == 1
    s.handle_event(ev("Stop"), now=2)
    assert agent(s).helpers == 0


def test_tick_thinking_after_tool_and_sleep():
    s = HubState()
    s.handle_event(ev("PreToolUse", tool_name="Read", tool_input={}), now=0)
    s.handle_event(ev("PostToolUse", tool_name="Read"), now=1)
    assert s.tick(now=1 + THINK_AFTER_TOOL - 1) == []
    s.tick(now=1 + THINK_AFTER_TOOL + 1)
    assert agent(s).activity == "thinking"

    s.handle_event(ev("Stop"), now=100)
    s.tick(now=100 + SLEEP_AFTER_IDLE + 1)
    assert agent(s).activity == "sleeping"


def test_long_running_tool_does_not_switch_to_thinking():
    s = HubState()
    s.handle_event(ev("PreToolUse", tool_name="Bash", tool_input={"command": "npm test"}), now=0)
    s.tick(now=500)
    assert agent(s).activity == "terminal"


def test_slots_colors_and_unique_names():
    s = HubState()
    for i in range(MAX_SLOTS + 2):
        s.handle_event(ev("SessionStart", sid=f"s{i}"), now=0)
    slots = [a.slot for a in s.agents.values()]
    assert sorted(x for x in slots if x is not None) == list(range(MAX_SLOTS))
    assert slots.count(None) == 2
    names = [a.name for a in s.agents.values()]
    assert len(set(names)) == len(names) and "webshop 2" in names
    # Slot genbruges når en agent forlader hubben
    s.handle_event(ev("SessionEnd", sid="s3"), now=1)
    s.handle_event(ev("SessionStart", sid="ny"), now=2)
    assert s.agents["ny"].slot == 3


def test_ignores_malformed_events():
    s = HubState()
    assert s.handle_event({}) == []
    assert s.handle_event({"session_id": "x"}) == []


def test_tool_detail():
    assert tool_detail("WebFetch", {"url": "https://docs.python.org/3/x"}) == "docs.python.org"
    assert tool_detail("Grep", {"pattern": "def main"}) == "def main"
    assert tool_detail("mcp__github__create_pull_request", {}) == "create pull request"
    assert tool_detail("Bash", {"command": "x" * 200}).endswith("…")
