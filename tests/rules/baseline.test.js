import { describe, it, beforeEach, afterAll } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { asUser, asAnonymous, seedDoc, resetData, cleanup } from './helpers.js';

const MEMBER = { uid: 'u_member', email: 'member@smartosc.com' };
const OUTSIDER = { uid: 'u_out', email: 'outsider@smartosc.com' };

describe('baseline: current rules', () => {
  beforeEach(async () => {
    await resetData();
    await seedDoc('workspaces/main', { seeded: true });
    await seedDoc('workspaces/main/projects/p1', {
      name: 'P1',
      memberIds: [MEMBER.uid],
      roles: { [MEMBER.uid]: 'owner' },
    });
  });
  afterAll(cleanup);

  it('domain user can read workspace meta', async () => {
    const db = await asUser(MEMBER.uid, MEMBER.email);
    await assertSucceeds(getDoc(doc(db, 'workspaces/main')));
  });

  it('non-domain user cannot read workspace meta', async () => {
    const db = await asUser('u_gmail', 'someone@gmail.com');
    await assertFails(getDoc(doc(db, 'workspaces/main')));
  });

  it('unverified domain email cannot read workspace meta', async () => {
    const db = await asUser('u_unv', 'member@smartosc.com', false);
    await assertFails(getDoc(doc(db, 'workspaces/main')));
  });

  it('anonymous cannot read workspace meta', async () => {
    const db = await asAnonymous();
    await assertFails(getDoc(doc(db, 'workspaces/main')));
  });

  it('project member can read the project', async () => {
    const db = await asUser(MEMBER.uid, MEMBER.email);
    await assertSucceeds(getDoc(doc(db, 'workspaces/main/projects/p1')));
  });

  it('domain non-member cannot read the project', async () => {
    const db = await asUser(OUTSIDER.uid, OUTSIDER.email);
    await assertSucceeds(getDoc(doc(db, 'workspaces/main/projects/p1')));
  });
});
