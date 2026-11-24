# Agent Hub – noter til Claude

3D-dashboard (Three.js i pywebview) der visualiserer lokale Claude Code-sessioner via hooks. Se README.md for arkitektur.

## Principper
- `hooks/agenthub_hook.py` må kun bruge standardbiblioteket og må aldrig blokere, printe til stdout eller returnere andet end exit 0.
- `agenthub/state.py` er sandheden for aktiviteter. Nye værktøjer mappes i `TOOL_ACTIVITY`. Frontend-tekster ligger i `agenthub/web/js/text.js`.
- Ingen build-step i frontend: rene ES-moduler + importmap, Three.js vendored i `agenthub/web/vendor` (r170). Ingen CDN, så det virker offline.
- Serveren binder kun til 127.0.0.1.
- Brugergrænsefladen er på dansk.

## Test
`python -m pytest -q`. Visuelt: `python -m agenthub --server-only --demo` og åbn `http://127.0.0.1:8765/?quality=low` (headless Chromium er langsom, så vent 30+ sek.).
