"""FastAPI-server: modtager hook-hændelser og streamer tilstand til 3D-vinduet.

    POST /event            <- hook-scriptet (hooks/agenthub_hook.py)
    WS   /ws               -> frontend (snapshot + løbende opdateringer)
    GET  /api/state        -> fuld tilstand (debug)
    POST /api/demo/start   -> start simulerede agenter
    POST /api/demo/stop
    GET  /                 -> 3D-frontend (agenthub/web)

Serveren lytter KUN på 127.0.0.1 – intet eksponeres på netværket.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .demo import Demo
from .state import HubState

WEB_DIR = Path(__file__).resolve().parent / "web"
TICK_SECONDS = 2.0


class Hub:
    def __init__(self) -> None:
        self.state = HubState()
        self.clients: set[WebSocket] = set()
        self.demo = Demo(self.ingest)

    async def broadcast(self, updates: list[dict]) -> None:
        if not updates or not self.clients:
            return
        msgs = [json.dumps(u, ensure_ascii=False) for u in updates]
        dead = []
        for ws in list(self.clients):
            try:
                for m in msgs:
                    await ws.send_text(m)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    async def ingest(self, event: dict) -> None:
        await self.broadcast(self.state.handle_event(event))

    async def ticker(self) -> None:
        while True:
            await asyncio.sleep(TICK_SECONDS)
            await self.broadcast(self.state.tick())


def create_app(start_demo: bool = False) -> FastAPI:
    hub = Hub()

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(hub.ticker())
        if start_demo:
            hub.demo.start()
        yield
        task.cancel()
        if hub.demo.running:
            await hub.demo.stop()

    app = FastAPI(title="Agent Hub", lifespan=lifespan)
    app.state.hub = hub

    @app.post("/event")
    async def event(request: Request):
        try:
            data = await request.json()
        except Exception:
            return JSONResponse({"ok": False, "error": "ugyldig JSON"}, status_code=400)
        if not isinstance(data, dict):
            return JSONResponse({"ok": False, "error": "forventede et objekt"}, status_code=400)
        await hub.ingest(data)
        return {"ok": True}

    @app.get("/api/state")
    async def get_state():
        return {**hub.state.snapshot(), "demo": hub.demo.running}

    @app.post("/api/demo/start")
    async def demo_start():
        hub.demo.start()
        return {"demo": True}

    @app.post("/api/demo/stop")
    async def demo_stop():
        await hub.demo.stop()
        return {"demo": False}

    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket):
        await ws.accept()
        hub.clients.add(ws)
        try:
            await ws.send_text(json.dumps({**hub.state.snapshot(), "demo": hub.demo.running}, ensure_ascii=False))
            while True:
                await ws.receive_text()  # holder forbindelsen åben; klienten sender ping
        except WebSocketDisconnect:
            pass
        finally:
            hub.clients.discard(ws)

    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
    return app
