// Gantt timeline view.
//
// W3-C1: rows are grouped Program -> Work stream -> Task (src/ganttRows.js). Group rows
// fold / unfold and carry a thin summary bar (earliest start -> latest end of their
// non-Dropped tasks, filled to their progress %). AllProjectsGantt shows
// Project -> Program -> Work stream for every project already loaded (no extra reads).
// Bars sit on a calendar X-axis with day/week/month zoom levels.
// Dependency arrows are SVG paths linking the END of an upstream task's bar
// to the START of a downstream task's bar (downstream = task whose
// `dependencyIds` includes the upstream task id). An arrow whose end is not a
// visible task row (folded group) is not drawn.
//
// We do NOT migrate the legacy free-form `dependencies` text field — that
// stays as user notes. The new explicit list is `task.dependencyIds: string[]`.
//
// Scroll model: a single outer scroll container holds the whole grid. The
// left task list uses `position: sticky; left: 0` so it stays fixed while
// the timeline scrolls horizontally; the header uses `position: sticky;
// top: 0` so dates stay visible while rows scroll vertically.

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { Project, Task, TaskStatus } from '../types';
import { isOverdueTask } from '../taskStatus';
import { buildGanttRows, buildAllProjectsGanttRows, ganttTaskIndex } from '../ganttRows';
import { TOK, FONT_STACK } from '../theme.js';


const ROW_H = 28;
const HEADER_H = 56;
const LEFT_PANE_W = 300;
const INDENT = 14;
const TODAY_COLOR = '#A32D2D';

type RowKind = 'project' | 'program' | 'workstream' | 'task';
interface GRow {
  kind: RowKind;
  key: string;
  depth: number;
  label: string;
  start: string | null;
  end: string | null;
  pct: number;
  status?: string;
  task?: Task;
  projectId?: string;
  collapsed: boolean;
}

type ZoomLevel = 'day' | 'week' | 'month';
type Range = { start: Date; end: Date };

const ZOOM_DAY_PX: Record<ZoomLevel, number> = {
  day: 28,
  week: 12,
  month: 4,
};

interface Props {
  project: Project;
  selectedTaskId: string | null;
  onTaskClick: (taskId: string) => void;
  scopeProgramId: string | null;
  scopeWsId?: string | null;
}

const toggleKey = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (key: string) =>
  set((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

export function GanttView({ project, selectedTaskId, onTaskClick, scopeProgramId, scopeWsId = null }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  useEffect(() => { setCollapsed(new Set()); }, [scopeProgramId, scopeWsId]);
  const rows = useMemo(
    () => buildGanttRows(project, { scopeProgramId, scopeWsId, collapsed }) as GRow[],
    [project, scopeProgramId, scopeWsId, collapsed],
  );
  const taskCount = rows.filter((r) => r.kind === 'task').length;
  if (rows.length === 0) {
    return <Empty text="No tasks to plot. Add tasks with start/end dates to use the Gantt view." />;
  }
  return (
    <GanttGrid
      rows={rows}
      cornerLabel="Program / Work stream / Task"
      countLabel={`${taskCount} task${taskCount === 1 ? '' : 's'}`}
      selectedTaskId={selectedTaskId}
      onTaskClick={onTaskClick}
      onToggle={toggleKey(setCollapsed)}
    />
  );
}

/** W3-C1: every loaded project, Project -> Program (-> Work stream when unfolded). */
export function AllProjectsGantt({
  projects,
  projectIds,
  onOpenProject,
}: {
  projects: Record<string, Project>;
  projectIds: string[];
  onOpenProject: (pid: string) => void;
}) {
  const defaultCollapsed = useMemo(() => {
    const s = new Set<string>();
    for (const pid of projectIds || []) for (const pg of projects?.[pid]?.programs || []) s.add(`pg:${pid}:${pg.id}`);
    return s;
  }, [projects, projectIds]);
  const [collapsed, setCollapsed] = useState<Set<string> | null>(null);
  const active = collapsed ?? defaultCollapsed;
  const rows = useMemo(
    () => buildAllProjectsGanttRows(projects, projectIds, { collapsed: active }) as GRow[],
    [projects, projectIds, active],
  );
  const onToggle = (key: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur ?? defaultCollapsed);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  if (!rows.some((r) => r.start && r.end)) return <Empty text="No dated tasks in any project yet." />;
  const n = rows.filter((r) => r.kind === 'project').length;
  return (
    <GanttGrid
      rows={rows}
      cornerLabel="Project / Program / Work stream"
      countLabel={`${n} project${n === 1 ? '' : 's'}`}
      selectedTaskId={null}
      onToggle={onToggle}
      onOpenProject={onOpenProject}
    />
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: TOK.muted,
        fontSize: 13,
        fontFamily: FONT_STACK,
      }}
    >
      {text}
    </div>
  );
}

function GanttGrid({
  rows,
  cornerLabel,
  countLabel,
  selectedTaskId,
  onTaskClick,
  onToggle,
  onOpenProject,
}: {
  rows: GRow[];
  cornerLabel: string;
  countLabel: string;
  selectedTaskId: string | null;
  onTaskClick?: (taskId: string) => void;
  onToggle: (key: string) => void;
  onOpenProject?: (pid: string) => void;
}) {
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const dayPx = ZOOM_DAY_PX[zoom];
  const scrollRef = useRef<HTMLDivElement>(null);

  // Date range covering all row spans (with padding) and always including today
  // so the today-line is on screen by default. Group spans cover folded tasks.
  const range: Range = useMemo(() => {
    let min: Date | null = null;
    let max: Date | null = null;
    for (const r of rows) {
      const s = parseDate(r.start);
      const e = parseDate(r.end);
      if (s && (!min || s < min)) min = s;
      if (e && (!max || e > max)) max = e;
    }
    const t = stripTime(new Date());
    if (!min || t < min) min = t;
    if (!max || t > max) max = t;
    return { start: addDays(min, -5), end: addDays(max, 7) };
  }, [rows]);

  const totalDays = Math.max(1, daysBetween(range.start, range.end));
  const timelineW = totalDays * dayPx;
  const totalH = rows.length * ROW_H;
  const rowIndexById = useMemo(() => ganttTaskIndex(rows) as Record<string, number>, [rows]);

  // Auto-scroll today into view on first render
  useEffect(() => {
    if (!scrollRef.current) return;
    const todayX = daysBetween(range.start, stripTime(new Date())) * dayPx;
    scrollRef.current.scrollLeft = Math.max(0, todayX - 200);
  }, [range.start, dayPx]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: FONT_STACK,
        background: TOK.bg,
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: '8px 14px',
          background: TOK.surface,
          borderBottom: '1px solid ' + TOK.line,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 500 }}>ZOOM</span>
        <div style={{ display: 'flex', gap: 2, padding: 2, background: TOK.bg, borderRadius: 6 }}>
          {(['day', 'week', 'month'] as ZoomLevel[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              style={{
                fontFamily: FONT_STACK,
                fontSize: 11,
                fontWeight: 500,
                padding: '4px 10px',
                borderRadius: 4,
                border: 'none',
                background: zoom === z ? TOK.surface : 'transparent',
                color: TOK.ink,
                cursor: 'pointer',
                textTransform: 'capitalize',
                boxShadow: zoom === z ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {z}
            </button>
          ))}
        </div>
        <button onClick={() => bumpZoom(setZoom, +1)} style={iconBtnStyle()} title="Zoom in">
          <ZoomIn size={13} />
        </button>
        <button onClick={() => bumpZoom(setZoom, -1)} style={iconBtnStyle()} title="Zoom out">
          <ZoomOut size={13} />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: TOK.subtle }}>
          {countLabel} · {fmt(range.start)} – {fmt(range.end)}
        </span>
      </div>

      {/* Single scroll container holds the whole grid */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: `${LEFT_PANE_W}px ${timelineW}px`,
            gridTemplateRows: `${HEADER_H}px ${totalH}px`,
            width: 'fit-content',
            minWidth: '100%',
          }}
        >
          {/* Top-left corner — sticky in BOTH directions so it stays put */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              left: 0,
              zIndex: 6,
              background: TOK.bg,
              borderBottom: '1px solid ' + TOK.line,
              borderRight: '1px solid ' + TOK.line,
              padding: '0 12px',
              fontSize: 11,
              fontWeight: 500,
              color: TOK.muted,
              display: 'flex',
              alignItems: 'center',
              textTransform: 'uppercase',
              letterSpacing: 0.04,
            }}
          >
            {cornerLabel}
          </div>

          {/* Timeline header — sticky top */}
          <div style={{ position: 'sticky', top: 0, zIndex: 5, background: TOK.surface, borderBottom: '1px solid ' + TOK.line }}>
            <TimelineHeader range={range} dayPx={dayPx} zoom={zoom} totalDays={totalDays} />
          </div>

          {/* Left list — sticky left */}
          <div style={{ position: 'sticky', left: 0, zIndex: 4, background: TOK.surface, borderRight: '1px solid ' + TOK.line }}>
            {rows.map((r) => (
              <LeftRow
                key={r.key}
                row={r}
                selected={!!r.task && selectedTaskId === r.task.id}
                onTaskClick={onTaskClick}
                onToggle={onToggle}
                onOpenProject={onOpenProject}
              />
            ))}
          </div>

          {/* Timeline body */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              {rows.map((r) => (
                <div
                  key={r.key}
                  style={{
                    height: ROW_H,
                    borderBottom: '1px solid ' + TOK.line,
                    position: 'relative',
                    background: r.task && selectedTaskId === r.task.id ? TOK.bg : r.kind === 'task' ? 'transparent' : 'rgba(26,26,25,0.025)',
                  }}
                >
                  {r.kind === 'task' && r.task ? (
                    <Bar
                      task={r.task}
                      range={range}
                      dayPx={dayPx}
                      selected={selectedTaskId === r.task.id}
                      onClick={() => onTaskClick?.(r.task!.id)}
                    />
                  ) : (
                    <SummaryBar row={r} range={range} dayPx={dayPx} />
                  )}
                </div>
              ))}
            </div>
            <DependencyArrows rows={rows} rowIndexById={rowIndexById} range={range} dayPx={dayPx} timelineW={timelineW} totalH={totalH} />
            <TodayLine range={range} dayPx={dayPx} totalH={totalH} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LeftRow({
  row: r,
  selected,
  onTaskClick,
  onToggle,
  onOpenProject,
}: {
  row: GRow;
  selected: boolean;
  onTaskClick?: (taskId: string) => void;
  onToggle: (key: string) => void;
  onOpenProject?: (pid: string) => void;
}) {
  const isTask = r.kind === 'task' && !!r.task;
  const dropped = isTask && r.task!.status === 'Dropped';
  // All-projects work stream rows have nothing below them: no chevron.
  const foldable = !isTask && !(onOpenProject && r.kind === 'workstream');
  const base: React.CSSProperties = {
    height: ROW_H,
    paddingLeft: 8 + r.depth * INDENT + (foldable ? 0 : 18),
    paddingRight: 10,
    borderBottom: '1px solid ' + TOK.line,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    cursor: isTask || foldable ? 'pointer' : 'default',
    background: selected ? TOK.bg : isTask ? 'transparent' : 'rgba(26,26,25,0.025)',
    fontSize: 12,
  };
  const onClick = () => {
    if (isTask) onTaskClick?.(r.task!.id);
    else if (foldable) onToggle(r.key);
  };
  const Chevron = r.collapsed ? ChevronRight : ChevronDown;
  return (
    <div
      onClick={onClick}
      style={base}
      onMouseEnter={(e) => (e.currentTarget.style.background = TOK.bg)}
      onMouseLeave={(e) => (e.currentTarget.style.background = base.background as string)}
      title={r.label}
    >
      {foldable && <Chevron size={14} color={TOK.muted} style={{ flexShrink: 0 }} />}
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: dropped ? TOK.subtle : TOK.ink,
          fontWeight: r.depth === 0 && !isTask ? 600 : r.kind === 'workstream' || r.kind === 'program' ? 500 : 400,
          textDecoration: dropped ? 'line-through' : 'none',
          opacity: dropped ? 0.6 : 1,
        }}
      >
        {r.label}
      </span>
      {isTask && isOverdue(r.task!) && <AlertTriangle size={11} color={TOK.overdueFg} style={{ marginLeft: 4 }} />}
      {!isTask && <span style={{ fontSize: 11, color: TOK.muted, flexShrink: 0 }}>{r.pct}%</span>}
      {r.kind === 'project' && onOpenProject && r.projectId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenProject(r.projectId!);
          }}
          style={{ ...iconBtnStyle(), fontSize: 11, padding: '2px 8px', marginLeft: 4 }}
        >
          Open
        </button>
      )}
    </div>
  );
}

function bumpZoom(set: React.Dispatch<React.SetStateAction<ZoomLevel>>, delta: number) {
  const order: ZoomLevel[] = ['month', 'week', 'day'];
  set((cur) => {
    const i = order.indexOf(cur);
    const next = Math.max(0, Math.min(order.length - 1, i + delta));
    return order[next];
  });
}

/* ─────── Timeline header (month bands + sub-ticks) ─────── */
function TimelineHeader({
  range,
  dayPx,
  zoom,
  totalDays,
}: {
  range: Range;
  dayPx: number;
  zoom: ZoomLevel;
  totalDays: number;
}) {
  const months: { label: string; xStart: number; xEnd: number }[] = [];
  const ticks: { label: string; x: number }[] = [];

  // Month bands
  let cursor = new Date(range.start);
  while (cursor <= range.end) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const xStart = Math.max(0, daysBetween(range.start, monthStart) * dayPx);
    const xEnd = Math.min(totalDays * dayPx, daysBetween(range.start, monthEnd) * dayPx);
    if (xEnd > xStart) {
      months.push({
        label: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        xStart,
        xEnd,
      });
    }
    cursor = monthEnd;
  }

  // Sub-ticks
  if (zoom === 'day') {
    let d = new Date(range.start);
    while (d <= range.end) {
      ticks.push({ label: String(d.getDate()), x: daysBetween(range.start, d) * dayPx });
      d = addDays(d, 1);
    }
  } else if (zoom === 'week') {
    let d = new Date(range.start);
    while (d.getDay() !== 1) d = addDays(d, 1);
    while (d <= range.end) {
      ticks.push({
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        x: daysBetween(range.start, d) * dayPx,
      });
      d = addDays(d, 7);
    }
  }

  return (
    <div style={{ position: 'relative', height: HEADER_H, width: totalDays * dayPx }}>
      <div style={{ position: 'absolute', inset: 0, height: HEADER_H / 2, borderBottom: '1px solid ' + TOK.line }}>
        {months.map((m, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: m.xStart,
              width: m.xEnd - m.xStart,
              height: '100%',
              borderRight: '1px solid ' + TOK.line,
              padding: '0 8px',
              fontSize: 11,
              fontWeight: 500,
              color: TOK.muted,
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {m.label}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: HEADER_H / 2, height: HEADER_H / 2 }}>
        {ticks.map((t, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: t.x,
              top: 0,
              bottom: 0,
              borderLeft: '1px solid ' + TOK.line,
              padding: '0 4px',
              fontSize: 10,
              color: TOK.subtle,
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────── Group summary bar: span of the non-Dropped tasks, filled to pct ─────── */
function SummaryBar({ row, range, dayPx }: { row: GRow; range: Range; dayPx: number }) {
  const start = parseDate(row.start);
  const end = parseDate(row.end);
  if (!start || !end || end < start) return null;
  const xStart = daysBetween(range.start, start) * dayPx;
  const xEnd = daysBetween(range.start, addDays(end, 1)) * dayPx;
  const w = Math.max(4, xEnd - xStart);
  return (
    <div
      title={`${row.label}\n${fmt(start)} → ${fmt(end)}\n${row.pct}%`}
      style={{
        position: 'absolute',
        left: xStart,
        top: (ROW_H - 8) / 2,
        height: 8,
        width: w,
        background: TOK.lineStrong,
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <div style={{ width: `${Math.max(0, Math.min(100, row.pct))}%`, height: '100%', background: TOK.doneFg, opacity: 0.75 }} />
    </div>
  );
}

function Bar({
  task,
  range,
  dayPx,
  selected,
  onClick,
}: {
  task: Task;
  range: Range;
  dayPx: number;
  selected: boolean;
  onClick: () => void;
}) {
  const start = parseDate(task.start);
  const end = parseDate(task.end);
  if (!start || !end || end < start) return null;
  const xStart = daysBetween(range.start, start) * dayPx;
  const xEnd = daysBetween(range.start, addDays(end, 1)) * dayPx;
  const w = Math.max(4, xEnd - xStart);
  const status = (task.status || 'Planned') as TaskStatus;
  const colors = barColors(status, isOverdue(task));
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${task.name}\n${fmt(start)} → ${fmt(end)}\n${status}${task.pic ? ' · ' + task.pic : ''}`}
      style={{
        position: 'absolute',
        left: xStart,
        top: (ROW_H - 18) / 2,
        height: 18,
        width: w,
        background: colors.bg,
        border: `1px ${colors.dashed ? 'dashed' : 'solid'} ${colors.border}`,
        borderRadius: 5,
        boxShadow: selected ? '0 0 0 2px ' + TOK.accent : 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        padding: '0 6px',
        overflow: 'hidden',
        fontSize: 10,
        color: colors.fg,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        opacity: colors.opacity,
        textDecoration: status === 'Dropped' ? 'line-through' : 'none',
      }}
    >
      {task.name}
    </div>
  );
}

function barColors(status: TaskStatus | string, overdue: boolean) {
  const solid = { dashed: false, opacity: 1 };
  if (overdue) return { fg: TOK.overdueFg, bg: TOK.overdueBg, border: TOK.overdueFg, ...solid };
  if (status === 'Completed') return { fg: TOK.doneFg, bg: TOK.doneBg, border: TOK.doneFg, ...solid };
  if (status === 'InProgress') return { fg: TOK.inprogFg, bg: TOK.inprogBg, border: TOK.inprogFg, ...solid };
  if (status === 'Submitted') return { fg: TOK.submittedFg, bg: TOK.submittedBg, border: TOK.submittedFg, dashed: true, opacity: 1 };
  if (status === 'Dropped') return { fg: TOK.subtle, bg: 'transparent', border: TOK.subtle, dashed: true, opacity: 0.6 };
  return { fg: TOK.plannedFg, bg: TOK.plannedBg, border: TOK.lineStrong, ...solid };
}

/* ─────── Today line ─────── */
function TodayLine({ range, dayPx, totalH }: { range: Range; dayPx: number; totalH: number }) {
  const today = stripTime(new Date());
  if (today < range.start || today > range.end) return null;
  const x = daysBetween(range.start, today) * dayPx + dayPx / 2;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        height: totalH,
        width: 0,
        borderLeft: `2px solid ${TODAY_COLOR}`,
        pointerEvents: 'none',
        zIndex: 4,
      }}
      title={`Today: ${fmt(today)}`}
    />
  );
}

/* ─────── Dependency arrows (SVG overlay) ─────── */
function DependencyArrows({
  rows,
  rowIndexById,
  range,
  dayPx,
  timelineW,
  totalH,
}: {
  rows: GRow[];
  rowIndexById: Record<string, number>;
  range: Range;
  dayPx: number;
  timelineW: number;
  totalH: number;
}) {
  const paths: { d: string; key: string }[] = [];
  for (const r of rows) {
    if (r.kind !== 'task' || !r.task) continue;
    const ids = r.task.dependencyIds || [];
    if (!ids.length) continue;
    const dsIdx = rowIndexById[r.task.id];
    const dsStart = parseDate(r.task.start);
    if (dsStart == null || dsIdx == null) continue;
    const dsX = daysBetween(range.start, dsStart) * dayPx;
    const dsY = dsIdx * ROW_H + ROW_H / 2;
    for (const upId of ids) {
      const upIdx = rowIndexById[upId];
      if (upIdx == null) continue; // upstream folded or in another program: no arrow
      const upTask = rows[upIdx].task;
      const upEnd = parseDate(upTask?.end);
      if (!upEnd) continue;
      const upX = daysBetween(range.start, addDays(upEnd, 1)) * dayPx;
      const upY = upIdx * ROW_H + ROW_H / 2;
      const midX = Math.max(upX + 8, dsX - 8);
      const d = `M ${upX} ${upY} L ${midX} ${upY} L ${midX} ${dsY} L ${dsX - 4} ${dsY}`;
      paths.push({ d, key: `${upId}->${r.task.id}` });
    }
  }
  if (paths.length === 0) return null;
  return (
    <svg width={timelineW} height={totalH} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 3 }}>
      <defs>
        <marker id="dep-arrow-head" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 0 0 L 6 4 L 0 8 z" fill={TOK.muted} />
        </marker>
      </defs>
      {paths.map((p) => (
        <path key={p.key} d={p.d} stroke={TOK.muted} strokeWidth="1.2" fill="none" markerEnd="url(#dep-arrow-head)" opacity="0.6" />
      ))}
    </svg>
  );
}

/* ─────── Helpers ─────── */
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(+d) ? null : stripTime(d);
}
function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((+b - +a) / 86_400_000);
}
function fmt(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function isOverdue(t: Task): boolean {
  return isOverdueTask(t, new Date());
}

function iconBtnStyle(): React.CSSProperties {
  return {
    fontFamily: FONT_STACK,
    fontSize: 12,
    padding: '5px 7px',
    borderRadius: 6,
    border: '1px solid ' + TOK.lineStrong,
    background: TOK.surface,
    color: TOK.ink,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
  };
}
