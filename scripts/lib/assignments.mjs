// P2.3 Task 6: PM / Sub-PM assignments for the pilot copy. Pure except for the
// workbook reader. Rows come from the p2-assignments.xlsx template written by
// p2-migrate-dryrun.mjs (sheet / column names are imported from there).
import * as XLSX from 'xlsx';
import { canonicalPerson } from '../../src/directory.js';
import { PROGRAMS_SHEET, WORKSTREAMS_SHEET } from '../p2-migrate-dryrun.mjs';

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const cell = (v) => (v == null ? '' : String(v).trim());
const low = (s) => cell(s).toLowerCase();
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Excel may turn a typed date into a serial number or a Date: normalise to yyyy-mm-dd.
function isoDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return cell(v);
}

// workbook -> { programs: row[], workstreams: row[] } (rows keyed by the template columns).
export function parseAssignmentsWorkbook(wb) {
  const read = (name) => {
    const sh = wb.Sheets?.[name];
    if (!sh) throw new Error(`Assignments file has no "${name}" sheet`);
    return XLSX.utils.sheet_to_json(sh, { defval: '', raw: true });
  };
  return { programs: read(PROGRAMS_SHEET), workstreams: read(WORKSTREAMS_SHEET) };
}

// directory = { dirIndex, uidByEmail } (see directoryFrom in p2-pilot-copy.mjs).
// -> { uid, name } | { error }.
function resolveEmail(directory, raw) {
  const s = cell(raw);
  const p = canonicalPerson(directory.dirIndex, s);
  if (!p.known) return { error: `"${s}" is not in the People directory` };
  const uid = directory.uidByEmail.get(p.id);
  if (!uid) return { error: `"${s}" (${p.id}) is only invited and has no uid yet (the person must sign in first)` };
  return { uid, name: p.name };
}

// writes = planned [{ path, data }] of the pilot copy (project doc + sub-docs).
// -> { writes (new array, input untouched), preview, errors }. When errors is
// non-empty the input writes are returned unchanged and the caller must refuse.
export function applyAssignments(writes, rows, directory, { projectNames = [] } = {}) {
  const errors = [];
  const names = new Set(projectNames.map(low).filter(Boolean));
  const mine = (r) => !low(r.Project) || names.has(low(r.Project));
  const progRows = (rows.programs || []).filter(mine);
  const wsRows = (rows.workstreams || []).filter(mine);
  if (!progRows.length && !wsRows.length) {
    errors.push(`No rows for project ${projectNames.map((n) => `"${n}"`).join(' / ')} in the assignments file`);
  }

  const out = writes.map((w) => ({ ...w, data: { ...w.data } }));
  const proj = out.find((w) => w.path.split('/').length === 4);
  if (!proj) throw new Error('applyAssignments: no project doc in writes');
  const programMeta = { ...(proj.data.programMeta || {}) };
  const wsDocs = out.filter((w) => w.path.split('/')[4] === 'workstreams');
  const progOf = new Map(); // ws doc id -> programMeta key
  for (const w of wsDocs) progOf.set(w.path.split('/')[5], w.data.programId);

  const assigned = new Set();
  const preview = { programs: [], workstreams: [] };
  const seen = new Set();
  const person = (raw, label, where, into) => {
    if (!cell(raw)) return null;
    const r = resolveEmail(directory, raw);
    if (r.error) { errors.push(`${where}: ${label} ${r.error}`); return null; }
    assigned.add(r.uid);
    into[label] = r.name;
    return r.uid;
  };

  const progKeyFor = (r, where) => {
    const id = cell(r['Program id']);
    if (id) {
      if (!hasOwn(programMeta, id)) { errors.push(`${where}: program id "${id}" does not exist in the source project`); return null; }
      return id;
    }
    const nm = low(r.Program);
    const hits = Object.keys(programMeta).filter((k) => low(programMeta[k]?.name) === nm);
    if (!nm || hits.length !== 1) {
      errors.push(`${where}: program ${nm ? `name "${cell(r.Program)}" matches ${hits.length} programs` : 'has no id or name'}`);
      return null;
    }
    return hits[0];
  };

  progRows.forEach((r, i) => {
    if (!cell(r['PM email']) && !cell(r['Deputy email'])) return;
    const where = `Programs row ${i + 2}`;
    const key = progKeyFor(r, where);
    if (key === null) return;
    if (seen.has(`p:${key}`)) { errors.push(`${where}: program "${key}" is assigned twice`); return; }
    seen.add(`p:${key}`);
    const who = {};
    const pmUid = person(r['PM email'], 'PM', where, who);
    const deputyUid = person(r['Deputy email'], 'Deputy', where, who);
    programMeta[key] = {
      ...programMeta[key],
      ...(pmUid ? { pmUid } : {}),
      ...(deputyUid ? { deputyUid } : {}),
    };
    preview.programs.push({ id: key, name: programMeta[key].name ?? key, ...who });
  });

  wsRows.forEach((r, i) => {
    const start = r.Start === '' ? '' : isoDate(r.Start);
    const end = r.End === '' ? '' : isoDate(r.End);
    if (!cell(r['Sub-PM email']) && !start && !end) return;
    const where = `Workstreams row ${i + 2}`;
    for (const [lab, v] of [['Start', start], ['End', end]]) {
      if (v && !ISO.test(v)) errors.push(`${where}: ${lab} "${v}" is not yyyy-mm-dd`);
    }
    if (ISO.test(start) && ISO.test(end) && start > end) errors.push(`${where}: Start ${start} is after End ${end}`);
    let doc;
    const id = cell(r['Workstream id']);
    if (id) {
      doc = wsDocs.find((w) => w.path.split('/')[5] === id);
      if (!doc) { errors.push(`${where}: workstream id "${id}" does not exist in the source project`); return; }
    } else {
      const nm = low(r.Workstream);
      let cands = wsDocs.filter((w) => low(w.data.name) === nm);
      if (cell(r.Program)) {
        const pk = Object.keys(programMeta).filter((k) => low(programMeta[k]?.name) === low(r.Program));
        cands = cands.filter((w) => pk.includes(progOf.get(w.path.split('/')[5])));
      }
      if (!nm || cands.length !== 1) {
        errors.push(`${where}: workstream ${nm ? `name "${cell(r.Workstream)}" matches ${cands.length} workstreams` : 'has no id or name'}`);
        return;
      }
      doc = cands[0];
    }
    const wsId = doc.path.split('/')[5];
    if (seen.has(`w:${wsId}`)) { errors.push(`${where}: workstream "${wsId}" is assigned twice`); return; }
    seen.add(`w:${wsId}`);
    const who = {};
    const leadUid = person(r['Sub-PM email'], 'Sub-PM', where, who);
    if (leadUid) doc.data.leadUid = leadUid;
    if (ISO.test(start)) doc.data.start = start;
    if (ISO.test(end)) doc.data.end = end;
    const pk = progOf.get(wsId);
    preview.workstreams.push({
      id: wsId, program: programMeta[pk]?.name ?? pk, name: doc.data.name ?? wsId, ...who,
      start: doc.data.start ?? null, end: doc.data.end ?? null,
    });
  });

  if (errors.length) return { writes, preview, errors };

  // Ruling G: assigned uids and every task / action picUid are members (both arrays).
  const add = new Set(assigned);
  for (const w of out) {
    const seg = w.path.split('/')[4];
    if ((seg === 'tasks' || seg === 'actions') && w.data.picUid) add.add(w.data.picUid);
  }
  const merge = (cur) => [...new Set([...(Array.isArray(cur) ? cur : []), ...add])];
  proj.data.programMeta = programMeta;
  proj.data.memberUids = merge(proj.data.memberUids);
  proj.data.memberIds = merge(proj.data.memberIds);
  return { writes: out, preview, errors };
}

// Printable preview: assigned names per program and workstream.
export function formatPreview(preview) {
  const lines = [];
  for (const p of preview.programs) {
    lines.push(`program ${p.id} (${p.name}): PM ${p.PM ?? '-'}, Deputy ${p.Deputy ?? '-'}`);
  }
  for (const w of preview.workstreams) {
    lines.push(`workstream ${w.id} (${w.program} / ${w.name}): Sub-PM ${w['Sub-PM'] ?? '-'}, ${w.start ?? '?'} to ${w.end ?? '?'}`);
  }
  return lines;
}
