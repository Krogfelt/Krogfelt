// Preview-tilstand: simulerer serveren direkte i browseren (ingen Python, ingen WebSocket).
// Bruges kun når siden vises uden backend, fx som delt preview på claude.ai.
// Sandheden for den rigtige app er agenthub/state.py – hold de to i trit ved ændringer
// af aktivitetsnavne eller felter.

const TOOL_ACTIVITY = {
  Edit: 'coding', Write: 'coding', MultiEdit: 'coding', Bash: 'terminal', Read: 'reading',
  Grep: 'exploring', Glob: 'exploring', WebSearch: 'browsing', WebFetch: 'browsing',
  TodoWrite: 'planning', Task: 'delegating', Agent: 'delegating',
};
const VERB = { coding: 'koder', terminal: 'kører', reading: 'læser', exploring: 'leder i koden', browsing: 'søger på nettet', planning: 'planlægger', delegating: 'sender en hjælper afsted', tool: 'bruger værktøj' };
const SPECIES = ['mochi', 'pip', 'sprout', 'zap', 'puff', 'bub'];
const COLORS = ['#ff9ec7', '#8fd3ff', '#ffd36e', '#a8e6a1', '#c9a7ff', '#ffb38a'];

const PROJECTS = ['webshop', 'data-pipeline', 'portfolio', 'ml-eksperiment', 'mobil-app', 'blog'];
const PROMPTS = [
  'Tilføj login med e-mail og kodeord', 'Find og ret fejlen i checkout-flowet',
  'Skriv tests for betalingsmodulet', 'Refaktorér databaselaget', 'Opdater README',
  'Undersøg hvorfor CI fejler på main', 'Lav en ny forside med hero-sektion',
];
const STEPS = [
  ['Read', 'app.py'], ['Read', 'README.md'], ['Grep', 'def checkout'], ['Glob', '**/*.tsx'],
  ['Edit', 'checkout.py'], ['Edit', 'Hero.tsx'], ['Write', 'test_payment.py'],
  ['Bash', 'pytest -q'], ['Bash', 'npm run build'], ['Bash', 'git status'],
  ['WebSearch', 'websocket reconnect best practice'], ['WebFetch', 'docs.python.org'],
  ['TodoWrite', 'TodoWrite'], ['Task', 'Undersøg testdækning'],
];

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const now = () => Date.now() / 1000;

export class SimConnection {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;
    this.agents = new Map();
    this.log = [];
    this.running = false;
    this.gen = 0;
    setTimeout(() => {
      onStatus?.(true);
      this.emitSnapshot();
      this.start();
    }, 50);
  }

  emitSnapshot() {
    this.onMessage({ type: 'snapshot', agents: [...this.agents.values()], log: this.log, server_time: now(), demo: this.running });
  }

  push(agent, kind, text) {
    this.onMessage({ type: 'agent', agent: { ...agent } });
    if (text) {
      const entry = { t: now(), agent_id: agent.id, name: agent.name, color: agent.color, kind, text };
      this.log.push(entry);
      if (this.log.length > 200) this.log.shift();
      this.onMessage({ type: 'log', entry });
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    const gen = ++this.gen;
    [0, 1, 2, 3].forEach((i) => this.session(i, gen));
  }

  stop() {
    this.running = false;
    this.gen++;
    for (const id of [...this.agents.keys()]) {
      this.agents.delete(id);
      this.onMessage({ type: 'remove', id });
    }
  }

  async session(i, gen) {
    const alive = () => this.running && this.gen === gen;
    await sleep(0.3 + i * 1.8);
    if (!alive()) return;
    const a = {
      id: `preview-${i}`, name: PROJECTS[i], project: PROJECTS[i], cwd: '', species: SPECIES[(i * 2 + 1) % SPECIES.length],
      color: COLORS[i], slot: [0, 2, 5, 7][i], activity: 'idle', detail: '', waiting: false, waiting_kind: '',
      helpers: 0, tool_count: 0, edit_count: 0, last_prompt: '', started: now(), last_event: now(), activity_since: now(), last_event_kind: '',
    };
    this.agents.set(a.id, a);
    this.push(a, 'join', 'dukkede op i hubben');
    const set = (activity, detail) => { a.activity = activity; if (detail !== undefined) a.detail = detail; a.last_event = now(); a.activity_since = now(); };

    await sleep(rnd(2, 4));
    while (alive()) {
      const prompt = pick(PROMPTS);
      a.last_prompt = prompt;
      set('thinking', prompt);
      this.push(a, 'prompt', `fik en opgave: «${prompt}»`);
      await sleep(rnd(2, 4));
      const steps = 4 + Math.floor(Math.random() * 5);
      for (let k = 0; k < steps && alive(); k++) {
        const [tool, detail] = pick(STEPS);
        const act = TOOL_ACTIVITY[tool] || 'tool';
        a.tool_count++;
        if (act === 'coding') a.edit_count++;
        if (act === 'delegating') a.helpers++;
        set(act, detail);
        this.push(a, act, `${VERB[act]}: ${detail}`);
        if (tool === 'Bash' && Math.random() < 0.35) {
          await sleep(1.2);
          if (!alive()) return;
          a.waiting = true; a.waiting_kind = 'permission';
          set('waiting', 'Claude needs your permission to use Bash');
          this.push(a, 'waiting', 'venter på din tilladelse: Bash');
          await sleep(rnd(5, 8));
          if (!alive()) return;
          a.waiting = false;
          set(act, detail);
          this.push(a);
        }
        await sleep(act === 'delegating' ? rnd(6, 9) : rnd(2.5, 5.5));
        if (act === 'delegating') { a.helpers = Math.max(0, a.helpers - 1); this.push(a); }
      }
      if (!alive()) return;
      a.helpers = 0;
      set('done', a.last_prompt);
      this.push(a, 'done', 'er færdig 🎉');
      await sleep(rnd(10, 18));
    }
  }
}
