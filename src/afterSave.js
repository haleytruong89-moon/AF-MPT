// W3-A1: side effects of an edit (activity entries, Chat cards) wait for that
// project's save. 'ok' sends them, a final refusal drops them, a retryable
// failure keeps them for the next attempt.

const DROP = new Set(['denied', 'refused', 'history', 'conflict', 'conflict-meta', 'readonly']);

export function createHeldEffects() {
  const held = new Map();
  return {
    hold(pid, fn) {
      if (!held.has(pid)) held.set(pid, []);
      held.get(pid).push(fn);
    },
    has(pid) { return (held.get(pid) || []).length > 0; },
    settle(pid, status) {
      const list = held.get(pid);
      if (!list || !list.length) return;
      if (status === 'ok') {
        held.delete(pid);
        for (const fn of list) {
          try { fn(); } catch { /* a failed side effect must not block the others */ }
        }
      } else if (DROP.has(status)) {
        held.delete(pid);
      }
    },
  };
}

function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter((k) => !k.startsWith('__') && v[k] !== undefined).sort()
      .map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}

function index(tree) {
  const out = new Map();
  for (const pg of tree?.programs || []) {
    const { workstreams, ...pgOwn } = pg;
    out.set('pg:' + pg.id, { label: `Program "${pg.name || pg.id}"`, v: stable({ ...pgOwn, raid: undefined }) });
    for (const ws of workstreams || []) {
      const { tasks, ...wsOwn } = ws;
      out.set('ws:' + ws.id, { label: `Work stream "${ws.name || ws.id}"`, v: stable(wsOwn) });
      for (const t of tasks || []) out.set('t:' + t.id, { label: `Task "${t.name || t.id}"`, v: stable(t) });
    }
  }
  for (const a of tree?.actionItems || []) out.set('a:' + a.id, { label: `Action "${a.title || a.id}"`, v: stable(a) });
  for (const d of tree?.decisions || []) out.set('d:' + d.id, { label: `Decision "${d.title || d.id}"`, v: stable(d) });
  return out;
}

/** Short labels of the items that differ between the in-memory tree and the saved tree. */
export function changedItemLabels(current, saved, max = 3) {
  const a = index(current);
  const b = index(saved);
  const labels = [];
  for (const [k, e] of a) if (!b.has(k) || b.get(k).v !== e.v) labels.push(e.label);
  for (const [k, e] of b) if (!a.has(k)) labels.push(e.label);
  if (!labels.length) return ['some changes'];
  return labels.length > max ? [...labels.slice(0, max), `and ${labels.length - max} more`] : labels;
}
