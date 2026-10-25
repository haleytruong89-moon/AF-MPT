// P3 review round 1: realistic close-transition payloads, shaped like the
// v2 executor writes them (src/execV2Save.js: tx.set of the FULL task doc +
// version + updatedBy + updatedAt serverTimestamp), on a task doc carrying
// the fields a migrated App task has. Shared by v2-p3.test.js (allow tests
// on the real rules) and v2-p3-headroom.test.js (padded rules).
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export const OWNER = { uid: 'u_owner', email: 'hattt4@smartosc.com' };
export const PM = { uid: 'u_pm', email: 'pm@smartosc.com' };
export const DEPUTY = { uid: 'u_deputy', email: 'deputy@smartosc.com' };
export const LEAD = { uid: 'u_lead', email: 'lead@smartosc.com' };
export const ASG = { uid: 'u_asg', email: 'asg@smartosc.com' };
export const VIEWER = { uid: 'u_viewer', email: 'viewer@smartosc.com' };
const ALL = [PM, DEPUTY, LEAD, ASG, VIEWER];

const WS = 'workspaces/main';
export const P1 = `${WS}/projects/p1`;
const T = `${P1}/tasks/tr`;

const member = (email) => ({
  email, displayName: email, aliases: [], department: 'AF', status: 'active',
  updatedAt: '2026-10-22T00:00:00Z', updatedBy: OWNER.email,
});

const programMeta = {
  prg1: { name: 'Program 1', order: 0, pmUid: PM.uid, deputyUid: DEPUTY.uid, start: '2026-01-01', end: '2026-12-31' },
  prg2: { name: 'Program 2', order: 1, pmUid: 'u_pm2', deputyUid: null, start: null, end: null },
};

const upd = (u, text, extra = {}) => ({
  id: `u_${text.length}_${u.uid}`, text, date: '2026-10-20', author: u.email, authorUid: u.uid,
  isBlocker: false, ...extra,
});

// A migrated App task: every field the tree carries, 6 updates, check-ins,
// references, a past deadline request.
export const realTask = (over = {}) => ({
  workspaceId: 'main', projectId: 'p1', programId: 'prg1', workstreamId: 'w1', order: 3,
  id: 'tr', name: 'Reconcile intercompany balances Q3', description: 'Match IC AR/AP across 4 entities',
  status: 'InProgress', health: 'Amber', healthNote: 'Waiting for SG entity confirmation',
  priority: 'High', progress: 60, start: '2026-09-01', end: '2026-10-31',
  pic: 'asg', picEmail: ASG.email, picUid: ASG.uid,
  contributors: ['viewer'], contributorUids: [VIEWER.uid],
  dependencies: ['t_prev'], tags: ['month-end', 'IC'],
  updates: [
    upd(VIEWER, 'Uploaded SG confirmation draft'),
    upd(ASG, 'SG entity has not confirmed', { isBlocker: true }),
    upd(ASG, 'VN and TH matched'),
    upd(LEAD, 'Please prioritise the SG balance'),
    upd(ASG, 'Pulled IC ledgers from the ERP'),
    upd(PM, 'Kick-off'),
  ],
  checkIns: [
    { date: '2026-10-20', status: 'InProgress', health: 'Amber', authorUid: ASG.uid },
    { date: '2026-10-13', status: 'InProgress', health: 'Green', authorUid: ASG.uid },
  ],
  references: [
    { id: 'ref_1', url: 'https://drive.example/ic', title: 'IC workbook', addedAt: '2026-10-01T00:00:00Z', addedBy: 'asg' },
    { id: 'ref_2', url: 'https://drive.example/sg', title: 'SG confirmation', addedAt: '2026-10-15T00:00:00Z', addedBy: 'viewer' },
  ],
  deadlineRequest: null,
  deadlineRequestHistory: [
    { newDate: '2026-10-31', reason: 'late input', requestedBy: 'asg', requestedAt: '2026-10-05T00:00:00Z', status: 'approved' },
  ],
  closeRequest: null,
  closeRequestHistory: [
    { id: 'cr0', status: 'Rejected', decidedByUid: LEAD.uid, decidedAt: '2026-10-10T00:00:00Z', reason: 'no evidence' },
  ],
  approvedByUid: null, approvedAt: null, closedByUid: null,
  createdAt: '2026-09-01T00:00:00Z', createdBy: PM.uid,
  updatedAt: '2026-10-20T00:00:00Z', updatedBy: ASG.uid, version: 7,
  ...over,
});

const cr = (requester, approver, over = {}) => ({
  id: 'cr1', outcome: 'Completed', requestedByUid: requester.uid, requestedBy: requester.email,
  approverUid: approver.uid, submittedAt: '2026-10-24T00:00:00Z', prevStatus: 'InProgress', note: 'All matched', ...over,
});
const hist = (status, decider, over = {}) => ({
  id: 'cr1', status, decidedByUid: decider.uid, decidedAt: '2026-10-25T00:00:00Z',
  before: 'Submitted', after: status, ...over,
});

const base = realTask();
const submittedTo = (approver) => realTask({ status: 'Submitted', closeRequest: cr(ASG, approver) });
const withUpd = (t, u, text) => [upd(u, text), ...t.updates];

// P3 Task 3 (Ruling P3-8): a blocker resolution is one added key of the
// blockerResolutions map, keyed by the blocker update's id.
const blockerId = base.updates[1].id;
const resolved = (u, note) => ({
  [blockerId]: { resolvedAt: '2026-10-25T00:00:00Z', resolvedBy: u.email, resolution: note, authorUid: u.uid },
});

// Each scenario: seed doc, actor, and the new full doc (before stamping).
export const scenarios = [
  {
    name: 'Assignee submit + update',
    seed: base, actor: ASG,
    next: { ...base, status: 'Submitted', closeRequest: cr(ASG, LEAD), updates: withUpd(base, ASG, 'Submitted as done') },
  },
  {
    name: 'LEAD reject + update',
    seed: submittedTo(LEAD), actor: LEAD,
    next: {
      ...submittedTo(LEAD), status: 'InProgress', closeRequest: null,
      closeRequestHistory: [hist('Rejected', LEAD, { reason: 'missing evidence' }), ...base.closeRequestHistory],
      updates: withUpd(base, LEAD, 'Close request rejected: missing evidence'),
    },
  },
  {
    name: 'PM reject (LEAD-addressed) + update',
    seed: submittedTo(LEAD), actor: PM,
    next: {
      ...submittedTo(LEAD), status: 'InProgress', closeRequest: null,
      closeRequestHistory: [hist('Rejected', PM, { reason: 'missing evidence' }), ...base.closeRequestHistory],
      updates: withUpd(base, PM, 'Close request rejected: missing evidence'),
    },
  },
  {
    name: 'DEPUTY approve + update',
    seed: submittedTo(LEAD), actor: DEPUTY,
    next: {
      ...submittedTo(LEAD), status: 'Completed', closeRequest: null,
      approvedByUid: DEPUTY.uid, approvedAt: '2026-10-25T00:00:00Z',
      closeRequestHistory: [hist('Approved', DEPUTY), ...base.closeRequestHistory],
      updates: withUpd(base, DEPUTY, 'Close request approved'),
    },
  },
  {
    name: 'PM reassign',
    seed: submittedTo(LEAD), actor: PM,
    next: {
      ...submittedTo(LEAD), closeRequest: cr(ASG, DEPUTY),
      closeRequestHistory: [hist('Reassigned', PM, { before: LEAD.uid, after: DEPUTY.uid }), ...base.closeRequestHistory],
    },
  },
  {
    name: 'LEAD direct close + update',
    seed: base, actor: LEAD,
    next: {
      ...base, status: 'Completed', approvedByUid: LEAD.uid, approvedAt: '2026-10-25T00:00:00Z',
      updates: withUpd(base, LEAD, 'Closed by Sub-PM'),
    },
  },
  {
    name: 'Assignee resolves a blocker + update',
    seed: base, actor: ASG,
    next: {
      ...base, blockerResolutions: resolved(ASG, 'SG confirmed by email'),
      updates: withUpd(base, ASG, 'SG entity confirmed the balance'),
    },
  },
  {
    name: 'contributor resolves a blocker + update',
    seed: base, actor: VIEWER,
    next: {
      ...base, blockerResolutions: resolved(VIEWER, 'SG confirmation received'),
      updates: withUpd(base, VIEWER, 'Got the SG confirmation'),
    },
  },
  {
    name: 'Assignee submit + blocker resolution + update',
    seed: base, actor: ASG,
    next: {
      ...base, status: 'Submitted', closeRequest: cr(ASG, LEAD),
      blockerResolutions: resolved(ASG, 'SG confirmed by email'),
      updates: withUpd(base, ASG, 'Submitted as done'),
    },
  },
];

// Fixture docs (written with rules disabled through seedFn(path, data)).
export async function seedScenario(seedFn, s) {
  await seedFn(WS, { seeded: true, ownerUids: [OWNER.uid], workspaceOwner: OWNER.email });
  for (const u of ALL) await seedFn(`${WS}/members/${u.uid}`, member(u.email));
  await seedFn(P1, {
    name: 'P', memberIds: ALL.map((u) => u.uid), roles: {}, programs: [], programMeta,
    memberUids: ALL.map((u) => u.uid), visibility: 'restricted', schemaVersion: 2,
  });
  await seedFn(`${P1}/workstreams/w1`, {
    workspaceId: 'main', projectId: 'p1', programId: 'prg1', name: 'WS', order: 0,
    leadUid: LEAD.uid, start: '2026-01-01', end: '2026-12-31', version: 1,
  });
  await seedFn(T, s.seed);
}

// The executor's write: full doc, version + 1, updatedBy, server updatedAt.
export function writeScenario(db, s) {
  return setDoc(doc(db, T), {
    ...s.next, version: s.seed.version + 1, updatedBy: s.actor.uid, updatedAt: serverTimestamp(),
  });
}
