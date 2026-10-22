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
  if (p) return { id: p.id, name: p.name, known: true };
  return { id: 'n:' + foldName(s), name: s.trim(), known: false };
}

export function pickerPeople(index) {
  return (index?.people || []).filter((p) => p.active).sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
}
