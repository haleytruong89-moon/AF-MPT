import { describe, it, expect } from 'vitest';
import { buildCloseSubmittedCard, buildCloseRejectedCard } from '../../src/chatNotify.js';

const URL = 'https://af-mpt.vercel.app/?project=p1&task=t1';
const texts = (card) => JSON.stringify(card);
const widgetsOf = (card) => card.cardsV2[0].card.sections[0].widgets;
const buttonUrl = (card) => {
  const w = widgetsOf(card).find((x) => x.buttonList || x.decoratedText?.button);
  const b = w.buttonList ? w.buttonList.buttons[0] : w.decoratedText.button;
  return { text: b.text, url: b.onClick.openLink.url };
};

describe('buildCloseSubmittedCard', () => {
  const base = { projectName: 'Treasury 2026', taskName: 'Reconcile', requesterName: 'Lybk', approverName: 'Hà', outcome: 'Completed', note: 'All matched', taskUrl: URL };
  it('names requester, task, outcome Done and approver', () => {
    const s = texts(buildCloseSubmittedCard(base));
    expect(s).toContain('Lybk submitted');
    expect(s).toContain('Reconcile');
    expect(s).toContain('as Done');
    expect(s).toContain('waiting for Hà');
    expect(s).toContain('All matched');
  });
  it('shows Dropped for a dropped outcome', () => {
    expect(texts(buildCloseSubmittedCard({ ...base, outcome: 'Dropped' }))).toContain('as Dropped');
  });
  it('escapes HTML-ish input', () => {
    const s = texts(buildCloseSubmittedCard({ ...base, taskName: '<b>x</b> & y', note: '<i>n</i>' }));
    expect(s).not.toContain('<i>n</i>');
    expect(s).toContain('&lt;b&gt;x&lt;/b&gt; &amp; y');
  });
  it('has an Open task button to taskUrl', () => {
    expect(buttonUrl(buildCloseSubmittedCard(base))).toEqual({ text: 'Open task', url: URL });
  });
  it('omits the note row when there is no note', () => {
    expect(texts(buildCloseSubmittedCard({ ...base, note: null }))).not.toContain('null');
  });
});

describe('buildCloseRejectedCard', () => {
  const base = { projectName: 'Treasury 2026', taskName: 'Reconcile', deciderName: 'Hà', requesterName: 'Lybk', reason: 'Missing evidence', taskUrl: URL };
  it('names decider, task, reason and requester', () => {
    const s = texts(buildCloseRejectedCard(base));
    expect(s).toContain('Hà rejected');
    expect(s).toContain('Reconcile');
    expect(s).toContain('Missing evidence');
    expect(s).toContain('Back to Lybk');
  });
  it('escapes HTML-ish reason', () => {
    const s = texts(buildCloseRejectedCard({ ...base, reason: '<script>' }));
    expect(s).not.toContain('<script>');
    expect(s).toContain('&lt;script&gt;');
  });
  it('has an Open task button to taskUrl', () => {
    expect(buttonUrl(buildCloseRejectedCard(base))).toEqual({ text: 'Open task', url: URL });
  });
});
