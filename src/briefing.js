// Audit 25/11 wave 5 PM-16 / MB-11 (spec docs/superpowers/specs/2026-11-25-ux-audit-waves-design.md):
// weekly briefing for a scope (every project / one project / a program / a work stream). Pure.
//  - "Completed" by approval date (approvedAt), else the planned end date (tasks closed before P3.1).
//  - every unresolved blocker, the ones raised in the window marked new.
//  - "For you" first: my overdue tasks, my tasks due in 7 days, close requests waiting for me.
//  - rich copy is built from the (edited) Markdown text: markdownToHtml.
import { scopeParts, actionInScope, decisionInScope } from './scope.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN = new Set(['Planned', 'InProgress']);
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
function parseDay(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * entries = [{ project (narrowed to the scope), orig (full project), sc (scope or null) }].
 * me = { uid, isMe(name) } (null under View as: no "For you").
 * decayOf(decision, now) -> { decayed, daysOverdue } (App's getDecisionDecay).
 */
export function collectBriefing({ entries, daysBack = 7, now = new Date(), me = null, decayOf = () => ({ decayed: false }) }) {
  const from = dayStart(new Date(now.getTime() - daysBack * DAY_MS));
  const today = dayStart(now);
  const horizon = new Date(today.getTime() + 7 * DAY_MS);
  const inWin = (s) => { const d = parseDay(s); return !!d && d >= from && d <= now; };
  const out = {
    from, now,
    forYou: { overdue: [], dueSoon: [], approvals: [] },
    newDecisions: [], decayedDecisions: [], newActions: [], completedActions: [],
    blockers: [], resolvedBlockers: [], overdueTasks: [], completedTasks: [],
  };
  const mine = (t) => !!me && typeof me.isMe === 'function' && !!t?.pic && me.isMe(t.pic);
  for (const { project, orig, sc } of arr(entries)) {
    const roles = orig?.__v2?.roles || null;
    for (const d of arr(project.decisions)) {
      if (!decisionInScope(orig, roles, d, sc)) continue;
      const decay = decayOf(d, now);
      if (decay?.decayed) out.decayedDecisions.push({ project: orig, decision: d, decay });
      if (inWin(d.date)) out.newDecisions.push({ project: orig, decision: d });
    }
    for (const a of arr(project.actionItems)) {
      if (!actionInScope(orig, a, sc)) continue;
      if (inWin(a.timestamp)) out.newActions.push({ project: orig, action: a });
      if (a.status === 'Done' && inWin(a.completedAt || a.timestamp)) out.completedActions.push({ project: orig, action: a });
    }
    for (const program of arr(project.programs)) {
      for (const workstream of arr(program.workstreams)) {
        for (const task of arr(workstream.tasks)) {
          const ref = { project: orig, program, workstream, task };
          for (const u of arr(task.updates)) {
            if (!u?.isBlocker) continue;
            if (!u.resolvedAt) out.blockers.push({ ...ref, update: u, isNew: inWin(u.timestamp) });
            else if (inWin(u.resolvedAt)) out.resolvedBlockers.push({ ...ref, update: u });
          }
          const status = task.status || 'Planned';
          const end = parseDay(task.end);
          if (OPEN.has(status) && end) {
            const diff = Math.round((dayStart(end) - today) / DAY_MS);
            if (diff < 0) {
              out.overdueTasks.push({ ...ref, lateDays: -diff });
              if (mine(task)) out.forYou.overdue.push({ ...ref, lateDays: -diff });
            } else if (end <= horizon && mine(task)) out.forYou.dueSoon.push({ ...ref, daysLeft: diff });
          }
          if (status === 'Completed') {
            const closed = task.approvedAt || null;
            if (closed ? inWin(closed) : inWin(task.end)) out.completedTasks.push({ ...ref, closedOn: closed || task.end, byPlan: !closed });
          }
          if (status === 'Submitted' && me?.uid && task.closeRequest?.approverUid === me.uid) out.forYou.approvals.push(ref);
        }
      }
    }
  }
  out.overdueTasks.sort((a, b) => b.lateDays - a.lateDays);
  out.forYou.overdue.sort((a, b) => b.lateDays - a.lateDays);
  out.forYou.dueSoon.sort((a, b) => a.daysLeft - b.daysLeft);
  out.blockers.sort((a, b) => Number(b.isNew) - Number(a.isNew) || Date.parse(b.update.timestamp || 0) - Date.parse(a.update.timestamp || 0));
  out.decayedDecisions.sort((a, b) => (b.decay.daysOverdue || 0) - (a.decay.daysOverdue || 0));
  return out;
}

/** Entries for a selection: projectId null = every project; scope applies to that project only. */
export function briefingEntries(projects, { projectId = null, scope = null, narrow }) {
  if (projectId) {
    const orig = projects?.[projectId];
    if (!orig) return [];
    const { programId } = scopeParts(orig, scope);
    const sc = programId ? scope : null;
    return [{ project: narrow(orig, sc), orig, sc }];
  }
  return Object.values(projects || {}).filter(Boolean).map((p) => ({ project: p, orig: p, sc: null }));
}

const cellText = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim();

/** Markdown text of the briefing. fmt = { date(d), dateTime(iso) }. */
export function briefingMarkdown(data, { title = 'Weekly Briefing', scopeLabel = null, ownerName = null, fmt }) {
  const L = [];
  const n = (k, one, many = one + 's') => `${k} ${k === 1 ? one : many}`;
  L.push(`# 📋 ${title}${scopeLabel ? ` — ${scopeLabel}` : ''} — ${fmt.date(data.from)} → ${fmt.date(data.now)}`, '');
  if (ownerName) L.push(`**Owner:** ${ownerName}`, '');
  const fy = data.forYou;
  if (fy.overdue.length + fy.dueSoon.length + fy.approvals.length > 0) {
    L.push('## 👤 For you', '');
    for (const o of fy.overdue) L.push(`- 🔴 **${o.task.name}** is ${o.lateDays}d overdue (${o.project.name} › ${o.workstream.name})`);
    for (const o of fy.dueSoon) L.push(`- 📅 **${o.task.name}** due ${o.daysLeft === 0 ? 'today' : `in ${o.daysLeft}d`} (${o.project.name} › ${o.workstream.name})`);
    for (const o of fy.approvals) L.push(`- ✅ Close request waiting for your approval: **${o.task.name}** (${o.project.name})`);
    L.push('');
  }
  const newBlockers = data.blockers.filter((b) => b.isNew).length;
  L.push('## 📊 At a glance', '');
  L.push(`- **${n(data.newDecisions.length, 'new decision')}** logged`);
  L.push(`- **${n(data.newActions.length, 'new action')}** created · **${data.completedActions.length}** completed`);
  L.push(`- **${n(data.blockers.length, 'open blocker')}** (${newBlockers} new) · **${data.resolvedBlockers.length}** resolved`);
  if (data.completedTasks.length) L.push(`- ✅ **${n(data.completedTasks.length, 'task')}** completed`);
  if (data.overdueTasks.length) L.push(`- 🔴 **${n(data.overdueTasks.length, 'task')}** overdue right now`);
  if (data.decayedDecisions.length) L.push(`- 🕐 **${n(data.decayedDecisions.length, 'decision')}** past their review date`);
  L.push('');
  if (data.overdueTasks.length) {
    L.push('## 🔴 Overdue right now', '', '| Task | Project › Program | PIC | Days late |', '|---|---|---|---|');
    for (const o of data.overdueTasks.slice(0, 15)) L.push(`| ${cellText(o.task.name)} | ${cellText(o.project.name)} › ${cellText(o.program.name)} | ${cellText(o.task.pic || '—')} | ${o.lateDays}d |`);
    if (data.overdueTasks.length > 15) L.push(`| _… and ${data.overdueTasks.length - 15} more_ | | | |`);
    L.push('');
  }
  if (data.blockers.length) {
    L.push('## 🚩 Open blockers', '');
    for (const b of data.blockers) {
      L.push(`- ${b.isNew ? '🆕 ' : ''}**${b.task.name}** (${b.project.name}): ${cellText(b.update.text)}`);
      L.push(`  - Raised by ${b.update.author || '—'} on ${fmt.dateTime(b.update.timestamp)}`);
    }
    L.push('');
  }
  if (data.decayedDecisions.length) {
    L.push('## 🕐 Decisions to review', '', '| Decision | Project | Days past review | Decided by |', '|---|---|---|---|');
    for (const d of data.decayedDecisions.slice(0, 10)) L.push(`| ${cellText((d.decision.text || '').slice(0, 80))} | ${cellText(d.project.name)} | ${d.decay.daysOverdue}d | ${cellText((d.decision.decidedBy || []).join(', '))} |`);
    L.push('');
  }
  if (data.newDecisions.length) {
    L.push('## 📋 New decisions', '');
    for (const { project, decision } of data.newDecisions) {
      L.push(`- **${decision.text}** _(${project.name})_`);
      const meta = [];
      if (arr(decision.decidedBy).length) meta.push(`by ${decision.decidedBy.join(', ')}`);
      if (decision.meetingRef) meta.push(decision.meetingRef);
      if (meta.length) L.push(`  - ${meta.join(' · ')}`);
    }
    L.push('');
  }
  if (data.resolvedBlockers.length) {
    L.push('## ✓ Blockers resolved', '');
    for (const b of data.resolvedBlockers) L.push(`- ${b.task.name} (${b.project.name})${b.update.resolvedBy ? ` — resolved by ${b.update.resolvedBy}` : ''}`);
    L.push('');
  }
  if (data.completedTasks.length || data.completedActions.length) {
    L.push('## ✅ Completed', '');
    for (const c of data.completedTasks) L.push(`- 🎯 ${c.task.name} (${c.project.name}) — ${c.byPlan ? 'planned end' : 'approved'} ${fmt.date(c.closedOn)}`);
    for (const c of data.completedActions) L.push(`- ✓ ${c.action.title} (${c.project.name})`);
    L.push('');
  }
  L.push('---', '', `_Generated ${fmt.dateTime(data.now.toISOString())} from AF Master Project Tracker._`);
  return L.join('\n');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])_(.+?)_(?=$|[\s).,:;])/g, '$1<em>$2</em>');

/**
 * The small Markdown used by the briefing / minutes -> inline-styled HTML for email:
 * # / ## headings, "- " items with "  - " sub-lines, | tables | (first row = header,
 * |---| skipped), ---, paragraphs, **bold**, _italic_. Everything else is escaped text.
 */
export function markdownToHtml(md) {
  const FONT = "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;";
  const cell = 'border: 1px solid #e5e3dc; padding: 6px 8px; vertical-align: top;';
  const out = [`<div style="${FONT} font-size: 14px; line-height: 1.55; color: #1a1a19; max-width: 900px;">`];
  let list = null; // array of { text, subs: [] }
  let table = null; // array of rows
  const flush = () => {
    if (list) {
      out.push('<ul style="margin: 0 0 14px; padding-left: 22px;">');
      for (const it of list) out.push(`<li>${inline(it.text)}${it.subs.map((x) => `<div style="font-size: 12px; color: #6e6c66; margin-top: 2px;">${inline(x)}</div>`).join('')}</li>`);
      out.push('</ul>');
      list = null;
    }
    if (table) {
      out.push(`<table style="border-collapse: collapse; width: 100%; margin: 0 0 14px; font-size: 13px;">`);
      table.forEach((r, i) => out.push(`<tr>${r.map((c) => (i === 0 ? `<th style="${cell} background: #f7f5ef; text-align: left;">${inline(c)}</th>` : `<td style="${cell}">${inline(c)}</td>`)).join('')}</tr>`));
      out.push('</table>');
      table = null;
    }
  };
  for (const raw of String(md || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (/^\|.*\|$/.test(line.trim())) {
      if (list) flush();
      const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
      (table = table || []).push(cells);
      continue;
    }
    if (table) flush();
    let m;
    if ((m = /^ {2,}- (.*)$/.exec(line)) && list) { list[list.length - 1].subs.push(m[1]); continue; }
    if ((m = /^- (.*)$/.exec(line))) { (list = list || []).push({ text: m[1], subs: [] }); continue; }
    flush();
    if (!line.trim()) continue;
    if ((m = /^## (.*)$/.exec(line))) out.push(`<h2 style="font-size: 16px; font-weight: 600; margin: 20px 0 8px;">${inline(m[1])}</h2>`);
    else if ((m = /^# (.*)$/.exec(line))) out.push(`<h1 style="font-size: 20px; font-weight: 600; margin: 0 0 10px;">${inline(m[1])}</h1>`);
    else if (/^-{3,}$/.test(line.trim())) out.push('<hr style="border: none; border-top: 1px solid #e5e3dc; margin: 20px 0;" />');
    else out.push(`<p style="margin: 0 0 10px;">${inline(line)}</p>`);
  }
  flush();
  out.push('</div>');
  return out.join('');
}
