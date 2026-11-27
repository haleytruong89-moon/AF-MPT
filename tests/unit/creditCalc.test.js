import { describe, it, expect } from 'vitest';
import { equalSplit, effectiveWeights, weightsOverflow, wsHasWork, programHasWork, creditSharesOf, defaultCreditShares, computeProjectCredits } from '../../src/creditCalc.js';

const close = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-9);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

describe('credit calculation (audit 27/11)', () => {
  it('CC-1 equal split adds up to exactly 100 (CR-4)', () => {
    close(sum(equalSplit(3)), 100);
    close(sum(equalSplit(7)), 100);
    expect(equalSplit(0)).toEqual([]);
  });

  it('CC-2 Q2 A: set weights kept, the rest split among siblings without a weight', () => {
    // 60 set, two unset -> 60 / 20 / 20
    expect(effectiveWeights([{ weight: 60 }, {}, {}])).toEqual([60, 20, 20]);
    // all set -> normalised (as before): 30 / 10 -> 75 / 25
    expect(effectiveWeights([{ weight: 30 }, { weight: 10 }])).toEqual([75, 25]);
    // set over 100 with unset siblings -> set scaled to 100, unset 0, flagged
    expect(effectiveWeights([{ weight: 80 }, { weight: 40 }, {}]).map((x) => Math.round(x * 100) / 100)).toEqual([66.67, 33.33, 0]);
    expect(weightsOverflow([{ weight: 80 }, { weight: 40 }, {}])).toBe(true);
    expect(weightsOverflow([{ weight: 60 }, {}])).toBe(false);
    // all set to 0 -> equal
    expect(effectiveWeights([{ weight: 0 }, { weight: 0 }])).toEqual([50, 50]);
  });

  it('CC-3 Q1 A: empty siblings get nothing, even with a weight', () => {
    const wss = [{ weight: 50, tasks: [{ status: 'Planned' }] }, { weight: 50, tasks: [] }, { tasks: [{ status: 'Dropped' }] }];
    expect(wss.map(wsHasWork)).toEqual([true, false, false]);
    expect(effectiveWeights(wss, wsHasWork)).toEqual([100, 0, 0]);
    expect(programHasWork({ workstreams: wss })).toBe(true);
    expect(programHasWork({ workstreams: [] })).toBe(false);
    expect(effectiveWeights([{}, {}], () => false)).toEqual([0, 0]);
  });

  it('CC-4 shares: explicit normalised, else PIC 100, else none; defaults 70/30, 70/15/15', () => {
    expect(creditSharesOf({ pic: 'Lan', creditShares: { Lan: 7, Minh: 3 } })).toEqual({ Lan: 70, Minh: 30 });
    expect(creditSharesOf({ pic: 'Lan' })).toEqual({ Lan: 100 });
    expect(creditSharesOf({})).toEqual({});
    expect(defaultCreditShares('Lan', ['Minh'])).toEqual({ Lan: 70, Minh: 30 });
    expect(defaultCreditShares('Lan', ['A', 'B', 'C'])).toBeNull();
  });

  it('CC-5 hand-computed project: lead by completed count, empty branches skipped, unallocated', () => {
    // Pool 100, lead Ha 10% -> 10 cp; program pool 90.
    // Programs: G1 (weight 60), G2 (no weight), G3 empty (no ws) -> G1 60, G2 40, G3 0.
    // G1: W1 (tasks a Completed Lan, b Planned no PIC), W2 empty -> W1 gets all 54.
    //   a = 27 (Lan, earned), b = 27 (no PIC -> unallocated).
    // G2: W3 (task c InProgress, Lan 70 / Minh 30) = 36 -> Lan 25.2, Minh 10.8 projected.
    // Lead: 3 tasks not dropped (a, b, c), 1 Completed -> 10 x 1/3.
    const project = {
      creditPoints: 100, projectLead: 'Ha', projectLeadShare: 10,
      programs: [
        { id: 'g1', name: 'G1', weight: 60, workstreams: [
          { id: 'w1', name: 'W1', tasks: [{ id: 'a', name: 'A', status: 'Completed', pic: 'Lan' }, { id: 'b', name: 'B', status: 'Planned' }, { id: 'x', name: 'X', status: 'Dropped', pic: 'Lan' }] },
          { id: 'w2', name: 'W2', weight: 90, tasks: [] },
        ] },
        { id: 'g2', name: 'G2', workstreams: [{ id: 'w3', name: 'W3', tasks: [{ id: 'c', name: 'C', status: 'InProgress', pic: 'Lan', creditShares: { Lan: 70, Minh: 30 } }] }] },
        { id: 'g3', name: 'G3', workstreams: [] },
      ],
    };
    const r = computeProjectCredits(project);
    close(r.leadCp, 10);
    close(r.perPic.get('Ha').earned, 10 / 3);
    close(r.perPic.get('Lan').earned, 27);
    close(r.perPic.get('Lan').projected, 27 + 25.2);
    close(r.perPic.get('Minh').projected, 10.8);
    close(r.unallocatedCp, 27);
    expect(r.noPicTasks).toBe(1);
    // every point is somewhere: people projected + unallocated = pool
    close(r.breakdown.reduce((s, b) => s + b.projected, 0) + r.unallocatedCp, 100);
  });

  it('CC-6 a project with no task anywhere: the whole program pool is unallocated', () => {
    const r = computeProjectCredits({ creditPoints: 100, programs: [{ id: 'g', name: 'G', workstreams: [] }] });
    close(r.unallocatedCp, 100);
    expect(r.breakdown).toEqual([]);
  });
});
