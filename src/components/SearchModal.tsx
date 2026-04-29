// Cross-project search (Cmd/Ctrl+K).
//
// Strategy: lazily fetch full project docs the first time the modal opens, so
// the cost is only paid when the user actually searches. Cache the result for
// 60 seconds so repeated open/close doesn't refetch.
//
// Searches: project names, task names, PIC, deliverables, dependencies (text),
// and check-in content. Results group by project; clicking a row navigates to
// that project + selects the matching task.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search as SearchIcon, X, MessageSquare, ChevronRight } from 'lucide-react';
import { fetchProjectOnce } from '../data';
import type { Project, Task } from '../types';

const TOK = {
  bg: '#F7F5EF',
  surface: '#FFFFFF',
  ink: '#1A1A19',
  muted: '#6E6C66',
  subtle: '#95938C',
  line: 'rgba(26,26,25,0.10)',
  lineStrong: 'rgba(26,26,25,0.22)',
  accent: '#3B6D11',
  hl: '#FAEEDA',
};
const FONT_STACK =
  '"Geist","Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

const MAX_RESULTS = 30;
const CACHE_TTL_MS = 60_000;

type ResultKind = 'project' | 'task' | 'checkin';

interface SearchHit {
  kind: ResultKind;
  projectId: string;
  projectName: string;
  taskId?: string;
  title: string;
  subtitle: string;
  // 0..1 — higher is better, used to rank
  score: number;
  // For check-in hits
  checkinSnippet?: string;
}

interface CachedIndex {
  fetchedAt: number;
  projects: Project[];
}

let cache: CachedIndex | null = null;

interface Props {
  open: boolean;
  onClose: () => void;
  myProjects: Project[]; // metadata + content already loaded for current
  onSelect: (projectId: string, taskId?: string) => void;
}

export function SearchModal({ open, onClose, myProjects, onSelect }: Props) {
  const [q, setQ] = useState('');
  const [loaded, setLoaded] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQ('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Lazy load full docs when modal opens (or use cache)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      // If cache is fresh, use it
      if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
        setLoaded(cache.projects);
        return;
      }
      setLoading(true);
      // Use the projects we already have full data for, then fetch any whose
      // content fields look unloaded (just a precaution; useMyProjects gives
      // us full docs already, so usually nothing to fetch).
      const ids = myProjects.map((p) => p.id);
      const results = await Promise.all(
        ids.map(async (id) => {
          const fromList = myProjects.find((p) => p.id === id);
          if (fromList && Array.isArray(fromList.programs)) return fromList;
          return fetchProjectOnce(id);
        })
      );
      const fresh = results.filter((p): p is Project => !!p);
      cache = { fetchedAt: Date.now(), projects: fresh };
      if (!cancelled) {
        setLoaded(fresh);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, myProjects]);

  const hits: SearchHit[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const out: SearchHit[] = [];

    for (const p of loaded) {
      // project name match
      const projName = (p.name || '').toLowerCase();
      if (projName.includes(term)) {
        out.push({
          kind: 'project',
          projectId: p.id,
          projectName: p.name,
          title: p.name,
          subtitle: `Project · ${(p.programs || []).length} programs`,
          score: scoreMatch(projName, term) + 0.2,
        });
      }

      for (const pg of p.programs || []) {
        for (const ws of pg.workstreams || []) {
          for (const t of ws.tasks || []) {
            const fields = [
              { label: 'name', value: t.name },
              { label: 'pic', value: t.pic || '' },
              { label: 'deliverables', value: t.deliverables || '' },
              { label: 'dependencies', value: t.dependencies || '' },
            ];
            for (const f of fields) {
              const v = (f.value || '').toString().toLowerCase();
              if (v && v.includes(term)) {
                out.push({
                  kind: 'task',
                  projectId: p.id,
                  projectName: p.name,
                  taskId: t.id,
                  title: t.name,
                  subtitle: `${p.name} › ${pg.name} › ${ws.name}${
                    f.label !== 'name' ? ` · matched ${f.label}` : ''
                  }`,
                  score: scoreMatch(v, term) + (f.label === 'name' ? 0.15 : 0),
                });
                break; // one hit per task is enough
              }
            }

            // check-in content match
            for (const c of t.checkIns || []) {
              const blob = `${c.done || ''} ${c.plan || ''} ${c.blockers || ''}`.toLowerCase();
              if (blob.includes(term)) {
                out.push({
                  kind: 'checkin',
                  projectId: p.id,
                  projectName: p.name,
                  taskId: t.id,
                  title: t.name,
                  subtitle: `Check-in by ${c.author} · ${p.name} › ${pg.name}`,
                  checkinSnippet: snippet(c.done || c.plan || c.blockers || '', term, 80),
                  score: scoreMatch(blob, term),
                });
                break;
              }
            }
          }
        }
      }
    }

    out.sort((a, b) => b.score - a.score);
    return out.slice(0, MAX_RESULTS);
  }, [q, loaded]);

  // Keep activeIdx in range when hits shrink
  useEffect(() => {
    if (activeIdx >= hits.length) setActiveIdx(0);
  }, [hits.length, activeIdx]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[activeIdx];
      if (hit) {
        onSelect(hit.projectId, hit.taskId);
        onClose();
      }
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,15,14,0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        zIndex: 200,
        fontFamily: FONT_STACK,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 620,
          maxWidth: 'calc(100% - 32px)',
          background: TOK.surface,
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderBottom: '1px solid ' + TOK.line,
          }}
        >
          <SearchIcon size={16} color={TOK.muted} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search across projects, tasks, check-ins…"
            style={{
              flex: 1,
              fontFamily: FONT_STACK,
              fontSize: 14,
              border: 'none',
              outline: 'none',
              padding: '4px 0',
              color: TOK.ink,
              background: 'transparent',
            }}
          />
          <kbd
            style={{
              fontSize: 10,
              color: TOK.muted,
              background: TOK.bg,
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid ' + TOK.line,
            }}
          >
            Esc
          </kbd>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 2 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: 20, color: TOK.muted, fontSize: 12, textAlign: 'center' }}>
              Loading project content…
            </div>
          )}
          {!loading && q.trim() && hits.length === 0 && (
            <div style={{ padding: 20, color: TOK.subtle, fontSize: 12, textAlign: 'center' }}>
              No matches in {loaded.length} project{loaded.length === 1 ? '' : 's'}.
            </div>
          )}
          {!loading && !q.trim() && (
            <div style={{ padding: 20, color: TOK.subtle, fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
              Type to search across {loaded.length} project{loaded.length === 1 ? '' : 's'}.<br />
              <span style={{ fontSize: 11 }}>Tip: ↑/↓ to navigate · Enter to open · Esc to close</span>
            </div>
          )}
          {hits.map((h, i) => (
            <Row
              key={`${h.kind}-${h.projectId}-${h.taskId || ''}-${i}`}
              hit={h}
              active={i === activeIdx}
              term={q.trim()}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => {
                onSelect(h.projectId, h.taskId);
                onClose();
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({
  hit,
  active,
  term,
  onClick,
  onMouseEnter,
}: {
  hit: SearchHit;
  active: boolean;
  term: string;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        padding: '10px 14px',
        cursor: 'pointer',
        background: active ? TOK.bg : 'transparent',
        borderTop: '1px solid ' + TOK.line,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          padding: '2px 7px',
          borderRadius: 999,
          color: TOK.muted,
          background: TOK.bg,
          border: '1px solid ' + TOK.line,
          flexShrink: 0,
          textTransform: 'capitalize',
        }}
      >
        {hit.kind === 'checkin' ? (
          <>
            <MessageSquare size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />
            check-in
          </>
        ) : (
          hit.kind
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: TOK.ink,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {highlight(hit.title, term)}
        </div>
        <div
          style={{
            fontSize: 11,
            color: TOK.muted,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginTop: 2,
          }}
        >
          {hit.subtitle}
        </div>
        {hit.checkinSnippet && (
          <div
            style={{
              fontSize: 11,
              color: TOK.subtle,
              marginTop: 4,
              fontStyle: 'italic',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            “{highlight(hit.checkinSnippet, term)}”
          </div>
        )}
      </div>
      <ChevronRight size={14} color={TOK.subtle} style={{ flexShrink: 0 }} />
    </div>
  );
}

/** Simple ranking: shorter strings score higher; full match scores higher. */
function scoreMatch(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0;
  const idx = haystack.indexOf(needle);
  if (idx < 0) return 0;
  // Earlier match = better; shorter haystack = better
  const positionScore = 1 - idx / Math.max(haystack.length, 1);
  const lengthScore = needle.length / Math.max(haystack.length, 1);
  return positionScore * 0.5 + lengthScore * 0.5;
}

function snippet(text: string, term: string, max: number): string {
  if (!text) return '';
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return text.slice(0, max);
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + term.length + max - 20);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const t = text;
  const lower = t.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const idx = lower.indexOf(lowerTerm);
  if (idx < 0) return t;
  return (
    <>
      {t.slice(0, idx)}
      <mark style={{ background: TOK.hl, color: TOK.ink, padding: '0 1px', borderRadius: 2 }}>
        {t.slice(idx, idx + term.length)}
      </mark>
      {t.slice(idx + term.length)}
    </>
  );
}

/** Keyboard shortcut hook — registers Cmd/Ctrl+K to toggle the modal. */
export function useSearchHotkey(open: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);
}

// Unused helper kept for API parity with other components — re-export Task type
export type { Task };
