// P1 identity helpers (pure). Collect every person string stored in project
// data and propose a mapping to a canonical person (email). Used by the
// read-only dry-run script scripts/p1-identity-dryrun.mjs; HOD approves the
// mapping before anything is written to Firestore.

export function foldName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

const isEmail = (s) => /@/.test(String(s || ''));

// Same fields as App.jsx collectProjectPicNames(), plus creditShares keys and
// action.author (both feed credit / activity attribution).
function forEachPersonField(project, add) {
  for (const pg of project?.programs || []) {
    for (const ws of pg.workstreams || []) {
      for (const t of ws.tasks || []) {
        if (t.pic) add(t.pic, 'task.pic');
        for (const c of t.contributors || []) add(c, 'task.contributors');
        for (const k of Object.keys(t.creditShares || {})) add(k, 'task.creditShares');
        for (const ci of t.checkIns || []) if (ci?.author) add(ci.author, 'task.checkIns.author');
        for (const u of t.updates || []) {
          if (u?.author) add(u.author, 'task.updates.author');
          if (u?.resolvedBy) add(u.resolvedBy, 'task.updates.resolvedBy');
        }
      }
    }
    for (const item of pg.raid || []) {
      if (item.owner) add(item.owner, 'raid.owner');
      if (item.createdBy) add(item.createdBy, 'raid.createdBy');
      if (item.approvedBy) add(item.approvedBy, 'raid.approvedBy');
      if (item.validationOwner) add(item.validationOwner, 'raid.validationOwner');
      for (const h of item.history || []) if (h?.author) add(h.author, 'raid.history.author');
      for (const m of item.mitigationActions || []) if (m?.pic) add(m.pic, 'mitigation.pic');
    }
  }
  for (const a of project?.actionItems || []) {
    if (a.pic) add(a.pic, 'action.pic');
    if (a.author) add(a.author, 'action.author');
    for (const d of a.decidedBy || []) add(d, 'action.decidedBy');
    for (const s of a.subtasks || []) if (s?.pic) add(s.pic, 'subtask.pic');
    for (const u of a.updates || []) if (u?.author) add(u.author, 'action.updates.author');
  }
  for (const d of project?.decisions || []) {
    if (d.author) add(d.author, 'decision.author');
    for (const x of d.decidedBy || []) add(x, 'decision.decidedBy');
  }
  if (project?.projectLead) add(project.projectLead, 'project.projectLead');
  for (const l of project?.weightChangeLog || []) if (l?.by) add(l.by, 'project.weightChangeLog.by');
}

export function collectPersonRefs(projects) {
  const map = new Map();
  for (const p of Object.values(projects || {})) {
    const pname = p?.name || p?.id || '?';
    forEachPersonField(p, (raw, source) => {
      const trimmed = String(raw).trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!map.has(key)) map.set(key, { raw: trimmed, count: 0, sources: new Set(), projects: new Set() });
      const e = map.get(key);
      e.count += 1; e.sources.add(source); e.projects.add(pname);
    });
  }
  const out = new Map();
  for (const [k, v] of map) out.set(k, { raw: v.raw, count: v.count, sources: [...v.sources].sort(), projects: [...v.projects].sort() });
  return out;
}

// email → { email, names[] } from team member lists and activity log authors
// (the shim stores author = verified email, authorName = display name).
export function buildKnownPeople(projects, activity) {
  const known = new Map();
  const add = (email, name) => {
    const e = String(email || '').trim().toLowerCase();
    if (!isEmail(e)) return;
    if (!known.has(e)) known.set(e, { email: e, names: new Set() });
    const n = String(name || '').trim();
    if (n && !isEmail(n)) known.get(e).names.add(n);
  };
  for (const p of Object.values(projects || {})) for (const m of p?.teamMembers || []) if (m?.email) add(m.email, m.name);
  for (const entries of Object.values(activity || {})) for (const a of entries || []) if (isEmail(a?.author)) add(a.author, a.authorName);
  const out = new Map();
  // multipleNames: the email carries names that differ even without diacritics.
  // A Restore can pair the restorer's email with someone else's name (risk #13).
  for (const [k, v] of known) {
    const names = [...v.names].sort();
    out.set(k, { email: v.email, names, multipleNames: new Set(names.map(foldName)).size > 1 });
  }
  return out;
}

function groupNames(projects) {
  const g = new Set();
  for (const p of Object.values(projects || {}))
    for (const r of p?.contributorRegistry || []) {
      const n = typeof r === 'string' ? r : r?.name;
      if (n) g.add(String(n).trim().toLowerCase());
    }
  return g;
}

const RANK = { none: 0, low: 1, medium: 2, high: 3, '': 4 };

export function proposeMapping(projects, activity) {
  const refs = collectPersonRefs(projects);
  const known = buildKnownPeople(projects, activity);
  const groups = groupNames(projects);
  const people = [...known.values()];
  const firstName = (p) => p.names[0] || '';

  const rows = [];
  for (const ref of refs.values()) {
    const lower = ref.raw.toLowerCase();
    const folded = foldName(ref.raw);
    const base = { raw: ref.raw, occurrences: ref.count, sources: ref.sources.join('; '), projects: ref.projects.join('; ') };
    let row;
    if (groups.has(lower)) {
      row = { type: 'group', email: '', name: '', confidence: '', note: 'department / group in contributor registry' };
    } else if (isEmail(ref.raw)) {
      const k = known.get(lower);
      row = k
        ? { type: 'person', email: k.email, name: firstName(k), confidence: 'high', note: '' }
        : { type: 'person', email: lower, name: '', confidence: 'medium', note: 'email not seen in team lists or activity' };
    } else {
      const exact = people.filter((p) => p.names.some((n) => n.toLowerCase() === lower));
      const local = people.filter((p) => p.email.split('@')[0] === lower);
      const fold = people.filter((p) => p.names.some((n) => foldName(n) === folded));
      const token = people.filter((p) => p.names.some((n) => foldName(n).split(' ')[0] === folded));
      const pick = (list, confidence, note) => (list.length === 1 ? { type: 'person', email: list[0].email, name: firstName(list[0]), confidence, note } : null);
      row = pick(exact, 'high', 'exact name')
        || pick(local, 'high', 'email local-part')
        || pick(fold, 'medium', 'same name without diacritics')
        || pick(token, 'low', 'first-name match only — verify')
        || { type: 'unknown', email: '', name: '', confidence: 'none',
             note: [exact, local, fold, token].some((l) => l.length > 1) ? 'ambiguous — several people match' : 'no match — enter email or mark as group' };
    }
    if (row.email && known.get(row.email)?.multipleNames) {
      if (row.confidence === 'high') row.confidence = 'medium';
      row.note = [row.note, `email seen with several names (${known.get(row.email).names.join(', ')}) — verify`].filter(Boolean).join('; ');
    }
    rows.push({ ...base, ...row });
  }
  rows.sort((a, b) => (RANK[a.confidence] - RANK[b.confidence]) || (b.occurrences - a.occurrences) || a.raw.localeCompare(b.raw));
  return rows;
}
