// Gantt timeline view.
//
// Layout: rows = tasks ordered by program → workstream → start date.
// Bars sit on a calendar X-axis with day/week/month zoom levels.
// Dependency arrows are SVG paths linking the END of an upstream task's bar
// to the START of a downstream task's bar (downstream = task whose
// `dependencyIds` includes the upstream task id).
//
// We do NOT migrate the legacy free-form `dependencies` text field — that
// stays as user notes. The new explicit list is `task.dependencyIds: string[]`.
//
// Scroll model: a single outer scroll container holds the whole grid. The
// left task list uses `position: sticky; left: 0` so it stays fixed while
// the timeline scrolls horizontally; the header uses `position: sticky;
// top: 0` so dates stay visible while rows scroll vertically.

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, AlertTriangle } from 'lucide-react';
import type { Project, Task, TaskStatus } from '../types';

const TOK = {
  bg: '#F7F5EF',
  surface: '#FFFFFF',
  ink: '#1A1A19',
  muted: '#6E6C66',
  subtle: '#95938C',
  line: 'rgba(26,26,25,0.10)',
  lineStrong: 'rgba(26,26,25,0.22)',
  accent: '#3B6D11',
  plannedFg: '#6E6C66',
  plannedBg: '#EDEBE4',
  inprogFg: '#A8660C',
  inprogBg: '#FAEEDA',
  doneFg: '#356512',
  doneBg: '#E6EFD6',
  overdueFg: '#A32D2D',
  overdueBg: '#FCEBEB',
};
const FONT_STACK =
  '"Geist","Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

const ROW_H = 28;
const HEADER_H = 56;
const LEFT_PANE_W = 260;
const TODAY_COLOR = '#A32D2D';

interface RowInfo {
  task: Task;
  programName: string;
  workstreamName: string;
  programId: string;
}

type ZoomLevel = 'day' | 'week' | 'month';

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
}

// Visual sort for task lists. Tasks with a start date come first in
// ascending order; tasks without a start date fall to the end. Mirrors
// sortTasksByStart in App.jsx — keep in sync. Returns a new array.
function sortTasksByStart<T extends { start?: string | null }>(tasks: T[] | null | undefined): T[] {
  const list = Array.isArray(tasks) ? tasks : [];
  return [...list].sort((a, b) => {
    const ad = a?.start ? +new Date(a.start) : Infinity;
    const bd = b?.start ? +new Date(b.start) : Infinity;
    if (isNaN(ad) && isNaN(bd)) return 0;
    if (isNaN(ad)) return 1;
    if (isNaN(bd)) return -1;
    return ad - bd;
  });
}

export function GanttView({ project, selectedTaskId, onTaskClick, scopeProgramId }: Props) {
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const dayPx = ZOOM_DAY_PX[zoom];
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows: RowInfo[] = useMemo(() => {
    const out: RowInfo[] = [];
    for (const pg of project.programs || []) {
      if (scopeProgramId && pg.id !== scopeProgramId) continue;
      for (const ws of pg.workstreams || []) {
        const sorted = sortTasksByStart(ws.tasks);
        for (const t of sorted) {
          out.push({ task: t, programName: pg.name, workstreamName: ws.name, programId: pg.id });
        }
      }
    }
    return out;
  }, [project, scopeProgramId]);

  // Date range covering all task spans (with ±5 days padding) and always
  // including today so the today-line is on screen by default.
  const range = useMemo(() => {
    let min: Date | null = null;
    let max: Date | null = null;
    for (const r of rows) {
      const s = parseDate(r.task.start);
      const e = parseDate(r.task.end);
      if (s && (!min || s < min)) min = s;
      if (e && (!max || e > max)) max = e;
    }
    const t = stripTime(new Date());
    if (!min || t < min) min = t;
    if (!max || t > max) max = t;
    if (!min || !max) {
      const now = stripTime(new Date());
      return { start: addDays(now, -10), end: addDays(now, 30) };
    }
    return { start: addDays(min, -5), end: addDays(max, 7) };
  }, [rows]);

  const totalDays = Math.max(1, daysBetween(range.start, range.end));
  const timelineW = totalDays * dayPx;
  const totalH = rows.length * ROW_H;

  const rowIndexById = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r, i) => (m[r.task.id] = i));
    return m;
  }, [rows]);

  // Auto-scroll today into view on first render
  useEffect(() => {
    if (!scrollRef.current) return;
    const todayX = daysBetween(range.start, stripTime(new Date())) * dayPx;
    scrollRef.current.scrollLeft = Math.max(0, todayX - 200);
  }, [range.start, dayPx]);

  if (rows.length === 0) {
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
        No tasks to plot. Add tasks with start/end dates to use the Gantt view.
      </div>
    );
  }

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
          {rows.length} task{rows.length === 1 ? '' : 's'} · {fmt(range.start)} – {fmt(range.end)}
        </span>
      </div>

      {/* Single scroll container holds the whole grid */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'relative',
            // Container width = left pane + timeline. Use grid for cleanliness.
            display: 'grid',
            gridTemplateColumns: `${LEFT_PANE_W}px ${timelineW}px`,
            gridTemplateRows: `${HEADER_H}px ${totalH}px`,
            // Allow horizontal scroll
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
            Task
          </div>

          {/* Timeline header — sticky top */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 5,
              background: TOK.surface,
              borderBottom: '1px solid ' + TOK.line,
            }}
          >
            <TimelineHeader range={range} dayPx={dayPx} zoom={zoom} totalDays={totalDays} />
          </div>

          {/* Left task list — sticky left */}
          <div
            style={{
              position: 'sticky',
              left: 0,
              zIndex: 4,
              background: TOK.surface,
              borderRight: '1px solid ' + TOK.line,
            }}
          >
            {rows.map((r) => (
              <div
                key={r.task.id}
                onClick={() => onTaskClick(r.task.id)}
                style={{
                  height: ROW_H,
                  padding: '0 12px',
                  borderBottom: '1px solid ' + TOK.line,
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: selectedTaskId === r.task.id ? TOK.bg : 'transparent',
                  fontSize: 12,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = TOK.bg)}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    selectedTaskId === r.task.id ? TOK.bg : 'transparent')
                }
              >
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: TOK.ink,
                  }}
                  title={`${r.programName} › ${r.workstreamName} › ${r.task.name}`}
                >
                  {r.task.name}
                </span>
                {isOverdue(r.task) && (
                  <AlertTriangle size={11} color={TOK.overdueFg} style={{ marginLeft: 4 }} />
                )}
              </div>
            ))}
          </div>

          {/* Timeline body */}
          <div style={{ position: 'relative' }}>
            <TimelineBody
              rows={rows}
              range={range}
              dayPx={dayPx}
              selectedTaskId={selectedTaskId}
              onTaskClick={onTaskClick}
            />
            <DependencyArrows
              rows={rows}
              rowIndexById={rowIndexById}
              range={range}
              dayPx={dayPx}
              timelineW={timelineW}
              totalH={totalH}
            />
            <TodayLine range={range} dayPx={dayPx} totalH={totalH} />
          </div>
        </div>
      </div>
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
  range: { start: Date; end: Date };
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
      {/* Month bands */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          height: HEADER_H / 2,
          borderBottom: '1px solid ' + TOK.line,
        }}
      >
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
      {/* Sub-ticks */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: HEADER_H / 2,
          height: HEADER_H / 2,
        }}
      >
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

/* ─────── Timeline body (rows + bars) ─────── */
function TimelineBody({
  rows,
  range,
  dayPx,
  selectedTaskId,
  onTaskClick,
}: {
  rows: RowInfo[];
  range: { start: Date; end: Date };
  dayPx: number;
  selectedTaskId: string | null;
  onTaskClick: (id: string) => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      {rows.map((r) => (
        <div
          key={r.task.id}
          style={{
            height: ROW_H,
            borderBottom: '1px solid ' + TOK.line,
            position: 'relative',
            background: selectedTaskId === r.task.id ? TOK.bg : 'transparent',
          }}
        >
          <Bar
            task={r.task}
            range={range}
            dayPx={dayPx}
            selected={selectedTaskId === r.task.id}
            onClick={() => onTaskClick(r.task.id)}
          />
        </div>
      ))}
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
  range: { start: Date; end: Date };
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
        border: `1px solid ${colors.border}`,
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
      }}
    >
      {task.name}
    </div>
  );
}

function barColors(status: TaskStatus, overdue: boolean) {
  if (overdue) return { fg: TOK.overdueFg, bg: TOK.overdueBg, border: TOK.overdueFg };
  if (status === 'Completed') return { fg: TOK.doneFg, bg: TOK.doneBg, border: TOK.doneFg };
  if (status === 'InProgress') return { fg: TOK.inprogFg, bg: TOK.inprogBg, border: TOK.inprogFg };
  return { fg: TOK.plannedFg, bg: TOK.plannedBg, border: TOK.lineStrong };
}

/* ─────── Today line ─────── */
function TodayLine({
  range,
  dayPx,
  totalH,
}: {
  range: { start: Date; end: Date };
  dayPx: number;
  totalH: number;
}) {
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
  rows: RowInfo[];
  rowIndexById: Record<string, number>;
  range: { start: Date; end: Date };
  dayPx: number;
  timelineW: number;
  totalH: number;
}) {
  const paths: { d: string; key: string }[] = [];
  for (const r of rows) {
    const ids = r.task.dependencyIds || [];
    if (!ids.length) continue;
    const dsIdx = rowIndexById[r.task.id];
    const dsStart = parseDate(r.task.start);
    if (dsStart == null || dsIdx == null) continue;
    const dsX = daysBetween(range.start, dsStart) * dayPx;
    const dsY = dsIdx * ROW_H + ROW_H / 2;
    for (const upId of ids) {
      const upIdx = rowIndexById[upId];
      if (upIdx == null) continue;
      const upTask = rows[upIdx].task;
      const upEnd = parseDate(upTask.end);
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
    <svg
      width={timelineW}
      height={totalH}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        pointerEvents: 'none',
        zIndex: 3,
      }}
    >
      <defs>
        <marker
          id="dep-arrow-head"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 6 4 L 0 8 z" fill={TOK.muted} />
        </marker>
      </defs>
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          stroke={TOK.muted}
          strokeWidth="1.2"
          fill="none"
          markerEnd="url(#dep-arrow-head)"
          opacity="0.6"
        />
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
  if (!t || t.status === 'Completed') return false;
  const e = parseDate(t.end);
  if (!e) return false;
  return e < stripTime(new Date());
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
