// Danske tekster og ikoner for aktiviteter – delt mellem 3D-scene og UI.

export const ACTIVITY = {
  idle:       { emoji: '😊', text: 'Slapper af' },
  thinking:   { emoji: '💭', text: 'Tænker' },
  coding:     { emoji: '⌨️', text: 'Koder' },
  terminal:   { emoji: '🖥️', text: 'Kører kommando' },
  reading:    { emoji: '📖', text: 'Læser' },
  exploring:  { emoji: '🔍', text: 'Leder i koden' },
  browsing:   { emoji: '🌐', text: 'Søger på nettet' },
  planning:   { emoji: '📋', text: 'Planlægger' },
  delegating: { emoji: '🤝', text: 'Sender hjælper afsted' },
  tool:       { emoji: '🔧', text: 'Bruger værktøj' },
  waiting:    { emoji: '❗', text: 'Venter på dig' },
  done:       { emoji: '🎉', text: 'Færdig' },
  sleeping:   { emoji: '💤', text: 'Sover' },
};

export const SPECIES_NAME = {
  mochi: 'Mochi', pip: 'Pip', sprout: 'Spire', zap: 'Zap', puff: 'Puf', bub: 'Bub',
};

export const STATION_ACTIVITIES = new Set([
  'thinking', 'coding', 'terminal', 'reading', 'exploring',
  'browsing', 'planning', 'delegating', 'tool',
]);

export function activityInfo(agent) {
  if (agent.waiting) {
    return agent.waiting_kind === 'permission'
      ? { emoji: '❗', text: 'Venter på din tilladelse' }
      : { emoji: '💬', text: 'Venter på dit svar' };
  }
  return ACTIVITY[agent.activity] || ACTIVITY.idle;
}

export function timeAgo(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 5) return 'lige nu';
  if (s < 60) return `${s} s siden`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min siden`;
  return `${Math.round(m / 60)} t siden`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
