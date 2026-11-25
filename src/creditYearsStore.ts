// G3: Firestore access for the year-end credit snapshot (workspaces/main/creditYears/{Y},
// people/{id}, projects/{pid}). Rules: Owner reads / writes all; an active member reads the
// year docs and only people/{their uid}. Docs are built by src/creditYearClose.js.
import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

const WORKSPACE = 'main';
const MAX_WRITES = 450; // Firestore batch limit is 500
type Data = Record<string, unknown>;
type Snap = { yearDoc: Data; people: Array<{ id: string; data: Data }>; projects: Array<{ id: string; data: Data }> };

const yearsCol = () => collection(db, 'workspaces', WORKSPACE, 'creditYears');
const yearRef = (year: number) => doc(db, 'workspaces', WORKSPACE, 'creditYears', String(year));
const subCol = (year: number, kind: 'people' | 'projects') => collection(db, 'workspaces', WORKSPACE, 'creditYears', String(year), kind);

/** Year docs by year number ({} when none / not readable). */
export async function loadCreditYearDocs(): Promise<Record<number, Data>> {
  const out: Record<number, Data> = {};
  const snap = await getDocs(yearsCol());
  snap.forEach((d) => { const y = Number(d.id); if (Number.isInteger(y)) out[y] = d.data(); });
  return out;
}

/** Owner: every person and project doc of a year. */
export async function loadYearSnapshot(year: number): Promise<{ people: Data[]; projects: Data[]; peopleIds: string[]; projectIds: string[] }> {
  const [p, q] = await Promise.all([getDocs(subCol(year, 'people')), getDocs(subCol(year, 'projects'))]);
  const people: Data[] = []; const peopleIds: string[] = [];
  const projects: Data[] = []; const projectIds: string[] = [];
  p.forEach((d) => { people.push(d.data()); peopleIds.push(d.id); });
  q.forEach((d) => { projects.push(d.data()); projectIds.push(d.id); });
  return { people, projects, peopleIds, projectIds };
}

/** A member's own frozen record for a year, or null. */
export async function loadMyYearPerson(year: number, uid: string): Promise<Data | null> {
  const d = await getDoc(doc(db, 'workspaces', WORKSPACE, 'creditYears', String(year), 'people', uid));
  return d.exists() ? d.data() : null;
}

/**
 * Owner: write a year snapshot. Person / project docs first (stale ones from an earlier close
 * deleted), in batches; the year doc (status 'closed') last, so a failure part-way leaves the
 * year open and reports stay live.
 */
export async function writeYearSnapshot(year: number, snap: Snap): Promise<void> {
  const before = await loadYearSnapshot(year);
  const keepPeople = new Set(snap.people.map((p) => p.id));
  const keepProjects = new Set(snap.projects.map((p) => p.id));
  type Op = (b: ReturnType<typeof writeBatch>) => void;
  const ops: Op[] = [];
  for (const id of before.peopleIds) if (!keepPeople.has(id)) ops.push((b) => b.delete(doc(subCol(year, 'people'), id)));
  for (const id of before.projectIds) if (!keepProjects.has(id)) ops.push((b) => b.delete(doc(subCol(year, 'projects'), id)));
  for (const p of snap.people) ops.push((b) => b.set(doc(subCol(year, 'people'), p.id), p.data));
  for (const p of snap.projects) ops.push((b) => b.set(doc(subCol(year, 'projects'), p.id), p.data));
  for (let i = 0; i < ops.length; i += MAX_WRITES) {
    const b = writeBatch(db);
    ops.slice(i, i + MAX_WRITES).forEach((op) => op(b));
    await b.commit();
  }
  await setDoc(yearRef(year), snap.yearDoc);
}

/** Owner: write the year doc only (Reopen). */
export async function saveYearDoc(year: number, data: Data): Promise<void> {
  await setDoc(yearRef(year), data);
}
