import { describe, it, expect } from 'vitest';
import { collectBriefing, briefingEntries, briefingMarkdown, markdownToHtml } from '../../src/briefing.js';
import { scopedProject } from '../../src/scope.js';

const NOW = new Date(2026, 11, 10, 15, 0); // Wed 10 Dec 2026
const task = (o) => ({ status: 'InProgress', updates: [], ...o });
const project = {
  id: 'p', name: 'CRP',
  programs: [
    { id: 'g1', name: 'Close', workstreams: [{ id: 'w1', name: 'Month-end', tasks: [
      task({ id: 'late', name: 'Late one', end: '2026-12-05', pic: 'Lan', updates: [
        { id: 'b-old', isBlocker: true, text: 'Old blocker', author: 'Minh', timestamp: '2026-11-01T02:00:00Z' },
        { id: 'b-new', isBlocker: true, text: 'New blocker', author: 'Minh', timestamp: '2026-12-08T02:00:00Z' },
        { id: 'b-res', isBlocker: true, text: 'x', timestamp: '2026-11-01T02:00:00Z', resolvedAt: '2026-12-09T02:00:00Z', resolvedBy: 'Ha' },
      ] }),
      task({ id: 'soon', name: 'Soon', end: '2026-12-12', pic: 'Lan' }),
      task({ id: 'appr', name: 'Approved in window', status: 'Completed', end: '2026-11-01', approvedAt: '2026-12-09T03:00:00Z' }),
      task({ id: 'apprOld', name: 'Approved long ago', status: 'Completed', end: '2026-12-08', approvedAt: '2026-11-01T03:00:00Z' }),
      task({ id: 'legacy', name: 'Legacy closed', status: 'Completed', end: '2026-12-07' }),
      task({ id: 'sub', name: 'Waiting me', status: 'Submitted', end: '2026-12-01', closeRequest: { approverUid: 'u_me' } }),
    ] }] },
    { id: 'g2', name: 'Tax', workstreams: [{ id: 'w2', name: 'VAT', tasks: [task({ id: 'tax', name: 'Tax late', end: '2026-12-01', pic: 'Chi' })] }] },
  ],
  actionItems: [
    { id: 'a1', title: 'New act', relatedTaskId: 'late', timestamp: '2026-12-09T00:00:00Z', status: 'Open' },
    { id: 'a2', title: 'Tax act', relatedTaskId: 'tax', timestamp: '2026-12-09T00:00:00Z', status: 'Done', completedAt: '2026-12-09T00:00:00Z' },
  ],
  decisions: [{ id: 'd1', text: 'Use new GL', date: '2026-12-08', relatedTaskIds: ['late'], decidedBy: ['Ha'] }],
};
const me = { uid: 'u_me', isMe: (n) => n === 'Lan' };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmt = { date: (d) => (d instanceof Date ? ymd(d) : String(d).slice(0, 10)), dateTime: (s) => String(s).slice(0, 16) };

describe('PM-16 / MB-11 briefing', () => {
  it('BR-1 whole project: completed by approval date (fallback planned end), all open blockers (new marked), overdue', () => {
    const b = collectBriefing({ entries: briefingEntries({ p: project }, { narrow: scopedProject }), now: NOW, me });
    expect(b.completedTasks.map((c) => [c.task.id, c.byPlan])).toEqual([['appr', false], ['legacy', true]]);
    expect(b.blockers.map((x) => [x.update.id, x.isNew])).toEqual([['b-new', true], ['b-old', false]]);
    expect(b.resolvedBlockers.map((x) => x.update.id)).toEqual(['b-res']);
    expect(b.overdueTasks.map((o) => [o.task.id, o.lateDays])).toEqual([['tax', 9], ['late', 5]]);
    expect(b.forYou.overdue.map((o) => o.task.id)).toEqual(['late']);
    expect(b.forYou.dueSoon.map((o) => [o.task.id, o.daysLeft])).toEqual([['soon', 2]]);
    expect(b.forYou.approvals.map((o) => o.task.id)).toEqual(['sub']);
    expect(b.newActions.map((a) => a.action.id)).toEqual(['a1', 'a2']);
  });
  it('BR-2 program scope keeps that program, its actions and decisions', () => {
    const b = collectBriefing({ entries: briefingEntries({ p: project }, { projectId: 'p', scope: 'g2', narrow: scopedProject }), now: NOW, me });
    expect(b.overdueTasks.map((o) => o.task.id)).toEqual(['tax']);
    expect(b.newActions.map((a) => a.action.id)).toEqual(['a2']);
    expect(b.newDecisions).toEqual([]);
    expect(b.forYou.overdue).toEqual([]);
  });
  it('BR-3 no me (View as): no For you block', () => {
    const b = collectBriefing({ entries: briefingEntries({ p: project }, { narrow: scopedProject }), now: NOW, me: null });
    const md = briefingMarkdown(b, { fmt });
    expect(md).not.toContain('For you');
    expect(md).toContain('🆕 **Late one**');
  });
  it('BR-4 markdown: For you first, then sections; scope label in the title', () => {
    const b = collectBriefing({ entries: briefingEntries({ p: project }, { narrow: scopedProject }), now: NOW, me });
    const md = briefingMarkdown(b, { scopeLabel: 'CRP', fmt });
    expect(md.split('\n')[0]).toBe('# 📋 Weekly Briefing — CRP — 2026-12-03 → 2026-12-10');
    expect(md.indexOf('## 👤 For you')).toBeLessThan(md.indexOf('## 📊 At a glance'));
    expect(md).toContain('- 🎯 Legacy closed (CRP) — planned end 2026-12-07');
  });
  it('BR-5 markdown to HTML: headings, lists with sub-lines, tables, emphasis, escaping', () => {
    const html = markdownToHtml('# T\n\n## H <x>\n\n- **a** _b_\n  - sub\n- c\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n---\nplain & text');
    expect(html).toContain('<h1 style="font-size: 20px; font-weight: 600; margin: 0 0 10px;">T</h1>');
    expect(html).toContain('H &lt;x&gt;</h2>');
    expect(html).toContain('<li><strong>a</strong> <em>b</em><div style="font-size: 12px; color: #6e6c66; margin-top: 2px;">sub</div></li><li>c</li>');
    expect(html).toMatch(/<tr><th[^>]*>A<\/th><th[^>]*>B<\/th><\/tr><tr><td[^>]*>1<\/td><td[^>]*>2<\/td><\/tr>/);
    expect(html).toContain('<hr');
    expect(html).toContain('<p style="margin: 0 0 10px;">plain &amp; text</p>');
  });
});
