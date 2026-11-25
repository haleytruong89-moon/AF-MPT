import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, getDocs, deleteDoc, collection } from 'firebase/firestore';
import { asUser, seedDoc, resetData, cleanup } from './helpers.js';

// G3: year-end credit snapshot. Owner reads / writes all; an active member reads the year
// doc and only their own person doc; project docs Owner only; no year-doc delete.
const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
const PM = { uid: 'u_pm', email: 'pm@smartosc.com' };
const MEMBER = { uid: 'u_member', email: 'member@smartosc.com' };
const DEACT = { uid: 'u_deact', email: 'deact@smartosc.com' };
const STRANGER = { uid: 'u_stranger', email: 'stranger@smartosc.com' };
const META = 'workspaces/main';
const Y = `${META}/creditYears/2026`;

const entry = (u, status = 'active') => ({
  email: u.email, displayName: 'X', aliases: [], department: 'AF', status,
  updatedAt: '2026-11-25T00:00:00Z', updatedBy: OWNER.email,
});
const yearDoc = (o = {}) => ({
  year: 2026, status: 'closed', closedAt: '2026-12-31T10:00:00.000Z', closedBy: 'Ha', closedByUid: OWNER.uid,
  timezone: 'Asia/Ho_Chi_Minh', precheck: { submitted: 0, noDate: 2, unlocked: 1 },
  log: [{ at: '2026-12-31T10:00:00.000Z', by: 'Ha', action: 'closed' }], ...o,
});
const person = (uid) => ({ year: 2026, personKey: `${uid}@smartosc.com`, uid, name: 'X', cp: 12, tasks: 3, projects: [], rows: [] });
const as = (u) => asUser(u.uid, u.email);

describe('G3 creditYears rules', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc(META, { seeded: true, workspaceOwner: OWNER.email, ownerUids: [OWNER.uid] });
    for (const u of [OWNER, PM, MEMBER]) await seedDoc(`${META}/members/${u.uid}`, entry(u));
    await seedDoc(`${META}/members/${DEACT.uid}`, entry(DEACT, 'deactivated'));
    await seedDoc(Y, yearDoc());
    await seedDoc(`${Y}/people/${MEMBER.uid}`, person(MEMBER.uid));
    await seedDoc(`${Y}/people/${PM.uid}`, person(PM.uid));
    await seedDoc(`${Y}/projects/p1`, { year: 2026, pid: 'p1', name: 'CRP', cp: 24, tasks: 6, people: [] });
  });
  afterAll(cleanup);

  it('G3-R1 Owner writes the year doc, people and projects; reads them back and lists them', async () => {
    const o = await as(OWNER);
    await assertSucceeds(setDoc(doc(o, `${META}/creditYears/2025`), yearDoc({ year: 2025 })));
    await assertSucceeds(setDoc(doc(o, `${Y}/people/${OWNER.uid}`), person(OWNER.uid)));
    await assertSucceeds(setDoc(doc(o, `${Y}/people/n_unknown_name`), { ...person('x'), uid: null }));
    await assertSucceeds(setDoc(doc(o, `${Y}/projects/p2`), { year: 2026, pid: 'p2', name: 'MA', cp: 1, tasks: 1, people: [] }));
    await assertSucceeds(getDocs(collection(o, `${Y}/people`)));
    await assertSucceeds(getDocs(collection(o, `${Y}/projects`)));
    await assertSucceeds(updateDoc(doc(o, Y), { status: 'open', log: [{ at: 'x', by: 'Ha', action: 'reopened', reason: 'fix weights' }] }));
    await assertSucceeds(deleteDoc(doc(o, `${Y}/people/${PM.uid}`)));
  });

  it('G3-R2 year doc shape: wrong year, unknown status, extra key are refused; nobody deletes it', async () => {
    const o = await as(OWNER);
    await assertFails(setDoc(doc(o, `${META}/creditYears/2027`), yearDoc({ year: 2026 })));
    await assertFails(setDoc(doc(o, `${META}/creditYears/2027`), yearDoc({ year: 2027, status: 'locked' })));
    await assertFails(setDoc(doc(o, `${META}/creditYears/2027`), yearDoc({ year: 2027, totals: { cp: 1 } })));
    await assertFails(setDoc(doc(o, `${META}/creditYears/2027`), yearDoc({ year: '2027' })));
    await assertFails(deleteDoc(doc(o, Y)));
  });

  it('G3-R3 member reads the year doc and only their own person doc', async () => {
    const m = await as(MEMBER);
    await assertSucceeds(getDoc(doc(m, Y)));
    await assertSucceeds(getDoc(doc(m, `${Y}/people/${MEMBER.uid}`)));
    await assertFails(getDoc(doc(m, `${Y}/people/${PM.uid}`)));
    await assertFails(getDocs(collection(m, `${Y}/people`)));
    await assertFails(getDoc(doc(m, `${Y}/projects/p1`)));
  });

  it('G3-R4 PM (not Owner) cannot write or read others; member cannot write their own doc', async () => {
    const p = await as(PM);
    await assertFails(setDoc(doc(p, Y), yearDoc()));
    await assertFails(updateDoc(doc(p, Y), { status: 'open' }));
    await assertFails(getDoc(doc(p, `${Y}/people/${MEMBER.uid}`)));
    await assertFails(setDoc(doc(p, `${Y}/people/${MEMBER.uid}`), person(MEMBER.uid)));
    await assertFails(getDocs(collection(p, `${Y}/projects`)));
    const m = await as(MEMBER);
    await assertFails(setDoc(doc(m, `${Y}/people/${MEMBER.uid}`), { ...person(MEMBER.uid), cp: 999 }));
    await assertFails(deleteDoc(doc(m, `${Y}/people/${MEMBER.uid}`)));
  });

  it('G3-R5 deactivated member and a domain account without a member doc read nothing', async () => {
    for (const u of [DEACT, STRANGER]) {
      const c = await as(u);
      await assertFails(getDoc(doc(c, Y)));
      await assertFails(getDoc(doc(c, `${Y}/people/${u.uid}`)));
    }
  });
});
