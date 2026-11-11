import { describe, it, expect } from 'vitest';
import { GLOSSARY } from '../../src/glossary';

const REQUIRED = ['PIC', 'Assignee', 'PM', 'Deputy', 'Sub-PM', 'RAID', 'Credit points (cp)', 'Weight', 'Hard deadline', 'Soft deadline', 'Submitted'];

describe('GLOSSARY', () => {
  it('has every required term exactly once', () => {
    const terms = GLOSSARY.map((g) => g.term);
    for (const t of REQUIRED) expect(terms.filter((x) => x === t)).toHaveLength(1);
  });
  it('each entry has non-empty en and vi', () => {
    for (const g of GLOSSARY) {
      expect(g.en.trim().length).toBeGreaterThan(0);
      expect(g.vi.trim().length).toBeGreaterThan(0);
    }
  });
});
