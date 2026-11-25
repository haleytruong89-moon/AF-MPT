import { describe, it, expect } from 'vitest';
import { deleteBlockMessage, DELETE_HAS_TASKS_MESSAGE } from '../../src/treeGuards.js';
import { dropRefusalReason, dragHint, OWNER_DRAG_HINT } from '../../src/roleUi.js';
import { buildCloseReassignedCard } from '../../src/chatNotify.js';

// W3-D3: PM items.
describe('W3-D3 deleteBlockMessage', () => {
  it('DB-1 no task / only dropped / mixed', () => {
    expect(deleteBlockMessage({ tasks: [] })).toBeNull();
    expect(deleteBlockMessage({ tasks: [{ status: 'Dropped' }, { status: 'Dropped' }] }))
      .toBe("This work stream keeps 2 dropped tasks for history, so it can't be deleted. Rename it, or move the tasks to another work stream first.");
    expect(deleteBlockMessage({ workstreams: [{ tasks: [{ status: 'Dropped' }] }] }))
      .toBe("This program keeps 1 dropped task for history, so it can't be deleted. Rename it, or move the tasks to a work stream of another program first.");
    expect(deleteBlockMessage({ tasks: [{ status: 'Dropped' }, { status: 'Planned' }] })).toBe(DELETE_HAS_TASKS_MESSAGE);
  });
});

describe('W3-D3 drop refusal and drag hint', () => {
  const roles = {
    programs: { p1: { pmUid: 'u_pm', deputyUid: null }, p2: { pmUid: 'x' } },
    workstreams: { w1: { programId: 'p1', start: '2026-01-01', end: '2026-06-30' }, w2: { programId: 'p1', start: '2026-01-01', end: '2026-03-31' } },
  };
  const ctx = (over) => ({ isOwner: false, isV2: true, roles, uid: 'u_pm', kind: 'task', sourcePgId: 'p1', targetPgId: 'p1', targetWsId: 'w1', taskStart: '2026-02-01', taskEnd: '2026-05-01', ...over });
  it('DR-1 each reason', () => {
    expect(dropRefusalReason(ctx({}))).toBeNull();
    expect(dropRefusalReason(ctx({ kind: 'ws' }))).toBe('Only the Owner moves work streams.');
    expect(dropRefusalReason(ctx({ targetPgId: 'p2' }))).toBe('Tasks can only move within your own program.');
    expect(dropRefusalReason(ctx({ uid: 'u_sub' }))).toBe('Only the PM or Deputy of this program moves tasks.');
    expect(dropRefusalReason(ctx({ targetWsId: 'w2' }))).toBe("The task's dates are outside that work stream's dates.");
  });
  it('DR-2 hint per tier', () => {
    expect(dragHint({ isOwner: true, isV2: true, roles, uid: 'o' })).toBe(OWNER_DRAG_HINT);
    expect(dragHint({ isOwner: false, isV2: true, roles, uid: 'u_pm' })).toBe('Drag tasks between work streams in your programs');
    expect(dragHint({ isOwner: false, isV2: true, roles, uid: 'u_member' })).toBeNull();
  });
});

describe('W3-D3 reassigned card', () => {
  it('RC-1 names who moved it, from, to; open-task button', () => {
    const c = buildCloseReassignedCard({ projectName: 'Ops', taskName: 'VAT', fromName: 'Lan', toName: 'Minh', byName: 'Ha', taskUrl: 'https://x/t' });
    const w = c.cardsV2[0].card.sections[0].widgets;
    expect(w[0].decoratedText.text).toBe('Ha moved the close request for VAT from Lan to Minh');
    expect(w[2].decoratedText.button.onClick.openLink.url).toBe('https://x/t');
  });
});

describe('HOD 25/11 Q4 blocker card', () => {
  it('BC-1 names the author, task and text; open-task button', async () => {
    const { buildBlockerCard } = await import('../../src/chatNotify.js');
    const c = buildBlockerCard({ projectName: 'Ops', taskName: 'VAT', authorName: 'Lan', text: 'waiting for bank', taskUrl: 'https://x/t' });
    const w = c.cardsV2[0].card.sections[0].widgets;
    expect(w[0].decoratedText.topLabel).toBe('🚩 BLOCKER');
    expect(w[0].decoratedText.text).toBe('Lan flagged a blocker on VAT: waiting for bank');
    expect(w[2].decoratedText.button.onClick.openLink.url).toBe('https://x/t');
  });
});
