// Sidebar of the navigation shell (spec docs/superpowers/specs/2026-11-27-nav-shell-design.md).
// Presentational: everything shown comes from navModel(); clicks go back through props.
import { useState } from 'react';
import { CheckSquare, FileText, Layers, ChevronDown, ChevronRight, UserCircle, X } from 'lucide-react';
import { NAV, TOK, FONT_STACK } from '../theme.js';
import { isProjectView } from '../navModel.js';

const DOT = { grey: '#64748B', green: '#22C55E', amber: '#F59E0B', red: '#EF4444' };
const overline = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: NAV.muted, padding: '18px 10px 6px' };

function Item({ active, onClick, children, tour, title }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" data-tour={tour} title={title} aria-current={active ? 'page' : undefined} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '7px 10px', border: 'none', borderRadius: 8, cursor: 'pointer',
        fontFamily: FONT_STACK, fontSize: 13.5, fontWeight: active ? 600 : 400,
        color: active ? NAV.activeFg : NAV.fg, background: active || hover ? NAV.hover : 'transparent',
      }}>{children}</button>
  );
}

export default function AppSidebar({ model, view, currentId, myWorkCount = 0, author = '', open = true, overlay = false, onView, onProject, onAccount, onClose }) {
  const [showClosed, setShowClosed] = useState(false);
  if (!open) return null;
  const inProject = isProjectView(view);
  const ICONS = { 'my-work': <CheckSquare size={16} aria-hidden="true" />, briefing: <FileText size={16} aria-hidden="true" /> };
  return (
    <>
      {overlay && <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 89, background: 'rgba(15,27,51,0.35)' }} />}
      <nav aria-label="Main" data-tour="view-tabs" style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: NAV.width, zIndex: 90, boxSizing: 'border-box',
        background: NAV.bg, color: NAV.fg, display: 'flex', flexDirection: 'column', padding: '14px 12px', gap: 2,
        fontFamily: FONT_STACK, overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 14px' }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: NAV.activeFg }}>AF</span>
          <span style={{ fontWeight: 600, fontSize: 14, color: NAV.muted, flex: 1 }}>Project Tracker</span>
          {overlay && <button type="button" aria-label="Close menu" onClick={onClose} style={{ border: 'none', background: 'none', color: NAV.fg, cursor: 'pointer', padding: 2 }}><X size={16} /></button>}
        </div>

        {model.mine.map((it) => (
          <Item key={it.id} tour={'tab-' + it.id} active={view === it.id} onClick={() => onView(it.id)}>
            {ICONS[it.id]}<span style={{ flex: 1 }}>{it.label}</span>
            {it.id === 'my-work' && myWorkCount > 0 && (
              <span style={{ background: TOK.overdueFg, color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 600, padding: '0 7px', lineHeight: '17px' }}>{myWorkCount}</span>
            )}
          </Item>
        ))}

        {(model.projects.length > 0 || model.closed.length > 0) && <div style={overline}>PROJECTS</div>}
        {model.projects.length > 0 && (
          <Item active={inProject && currentId === '__all__'} onClick={() => onProject('__all__')}>
            <Layers size={16} aria-hidden="true" /><span style={{ flex: 1 }}>All projects</span>
          </Item>
        )}
        {model.projects.map((p) => (
          <Item key={p.id} active={inProject && currentId === p.id} onClick={() => onProject(p.id)} title={`${p.name} · ${p.dot.title}`}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: DOT[p.dot.tone], flex: 'none' }} />
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
            <span style={{ fontSize: 11.5, color: NAV.muted, fontVariantNumeric: 'tabular-nums' }}>{p.pct == null ? '—' : p.pct + '%'}</span>
          </Item>
        ))}
        {model.closed.length > 0 && (
          <>
            <Item onClick={() => setShowClosed(!showClosed)}>
              {showClosed ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              <span style={{ color: NAV.muted }}>Closed projects ({model.closed.length})</span>
            </Item>
            {showClosed && model.closed.map((p) => (
              <Item key={p.id} active={inProject && currentId === p.id} onClick={() => onProject(p.id)}>
                <span style={{ width: 8, flex: 'none' }} /><span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: NAV.muted }}>{p.name}</span>
              </Item>
            ))}
          </>
        )}

        {model.management.length > 0 && <div style={overline}>MANAGEMENT</div>}
        {model.management.map((it) => (
          <Item key={it.id} tour={'tab-' + it.id} active={view === it.id} onClick={() => onView(it.id)} title="Workspace owner only">
            <span style={{ flex: 1 }}>{it.label}</span>
          </Item>
        ))}

        <div style={{ flex: 1 }} />
        <button type="button" onClick={onAccount} title="Account menu" style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 8px', border: 'none', borderTop: '1px solid ' + NAV.hover,
          background: 'transparent', color: NAV.activeFg, cursor: 'pointer', fontFamily: FONT_STACK, fontSize: 13, textAlign: 'left',
        }}>
          <UserCircle size={18} aria-hidden="true" /><span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{author}</span>
        </button>
      </nav>
    </>
  );
}
