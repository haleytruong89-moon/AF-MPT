// P1 identity directory (pure). Resolve any string that names a person (email,
// local-part, display name with/without diacritics, alias) to one canonical id
// (lower-cased email). Strings that resolve to no one pass through as 'n:<folded>'.
import { foldName } from './identity.js';

export function buildDirectoryIndex(entries) {
  const people = [];
  const claims = new Map(); // key -> Set of emails
  const claim = (key, email) => {
    if (!key) return;
    if (!claims.has(key)) claims.set(key, new Set());
    claims.get(key).add(email);
  };
  const seen = new Set();
  for (const e of entries || []) {
    const email = String(e?.email || '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    people.push({ id: email, email, name: e.displayName, active: e.status !== 'deactivated' });
    claim(email, email);
    claim(email.split('@')[0], email);
    claim(foldName(e.displayName), email);
    for (const a of e.aliases || []) claim(foldName(a), email);
  }
  const byEmail = new Map(people.map((p) => [p.email, p]));
  const byKey = new Map();
  const conflicts = [];
  for (const [key, set] of claims) {
    if (set.size > 1) conflicts.push({ alias: key, emails: [...set].sort() });
    else byKey.set(key, byEmail.get([...set][0]));
  }
  return { byKey, people, conflicts };
}

export function canonicalPerson(index, raw) {
  const s = String(raw || '');
  const p = index && (index.byKey.get(s.trim().toLowerCase()) || index.byKey.get(foldName(s)));
  if (p) return { id: p.id, name: p.name || p.email, known: true };
  return { id: 'n:' + foldName(s), name: s.trim(), known: false };
}

// The name to store for a person string: directory display name when known,
// else the trimmed input.
export function canonicalName(index, raw) {
  return canonicalPerson(index, raw).name;
}

// Grouping key / display label for a raw person string. With no index both are
// the raw string itself (legacy behaviour: exact, case-sensitive grouping).
export function personKey(index, raw) {
  return index ? canonicalPerson(index, raw).id : raw;
}
export function personLabel(index, raw) {
  return index ? canonicalPerson(index, raw).name : raw;
}

// Find the member record ({ name, email }) for a raw person string. With no
// index: exact name match (legacy). With an index: the same person, matched on
// the member's email or name against any alias of `raw`.
export function findMember(members, raw, index) {
  if (!index) return (members || []).find((m) => m?.name === raw);
  if (!raw) return undefined;
  const id = personKey(index, raw);
  return (members || []).find((m) => m && ((m.email && personKey(index, m.email) === id) || (m.name && personKey(index, m.name) === id)));
}

// Group raw person strings by person, in first-seen order of the group id.
export function groupByPerson(values, index) {
  const groups = new Map();
  for (const raw of values || []) {
    const id = personKey(index, raw);
    if (!groups.has(id)) groups.set(id, { id, name: personLabel(index, raw), count: 0, values: [] });
    const g = groups.get(id);
    g.count++;
    g.values.push(raw);
  }
  return [...groups.values()];
}

export function pickerPeople(index) {
  return (index?.people || []).filter((p) => p.active).sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
}
