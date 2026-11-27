// One-row top bar + project tabs of the navigation shell (spec 2026-11-27). Presentational.
import { Menu, Search, HelpCircle, MoreHorizontal, AlertTriangle } from 'lucide-react';
import { TOK, FONT_STACK } from '../theme.js';

const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 32, minWidth: 32, padding: '0 8px',
  border: '1px solid ' + TOK.lineStrong, borderRadius: 8, background: TOK.surface, color: TOK.ink, cursor: 'pointer',
  fontFamily: FONT_STACK, fontSize: 12,
};

export default function TopBar({ title = '', project = null, roleSummary = null, progress = null, scope = null, saveChip = null, tabs = [], showMenuButton = false, onMenu, onTab, onSearch, onHelp, onMore }) {
  const viewOnly = roleSummary?.label === 'View only';
  return (
    <header style={{ background: TOK.surface, borderBottom: '1px solid ' + TOK.line, fontFamily: FONT_STACK, flex: 'none' }}>
      <div style={{ height: 56, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {showMenuButton && <button type="button" aria-label="Open menu" onClick={onMenu} style={iconBtn}><Menu size={15} /></button>}
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: TOK.ink, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '0 1 auto' }}>{project ? project.name : title}</h1>
        {roleSummary && (
          <span data-tour="role-chip" title={roleSummary.detail.join('\n')} style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 999, flex: 'none',
            border: '1px solid ' + (viewOnly ? TOK.line : TOK.lineStrong), background: viewOnly ? TOK.bg : TOK.surface,
            color: viewOnly ? TOK.muted : TOK.ink, fontWeight: viewOnly ? 400 : 500,
          }}>Your role: {roleSummary.label}</span>
        )}
        {progress && (
          <span style={{ fontSize: 12, color: TOK.muted, display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
            <span><span style={{ color: TOK.accent, fontWeight: 600, fontSize: 13 }}>{progress.pct}%</span> · {progress.done}/{progress.total} complete</span>
            {progress.overdue > 0 && <span style={{ color: TOK.overdueFg, display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={12} aria-hidden="true" /> {progress.overdue} overdue</span>}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 8 }} />
        {saveChip}
        {scope && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: TOK.muted, fontWeight: 500, flex: 'none' }}>Scope
            <select value={scope.value} onChange={(e) => scope.onChange(e.target.value)}
              style={{ fontFamily: FONT_STACK, fontSize: 12, height: 32, maxWidth: 220, padding: '0 22px 0 8px', border: '1px solid ' + TOK.lineStrong, borderRadius: 8, background: TOK.surface, color: TOK.ink, cursor: 'pointer' }}>
              {scope.options.map((o) => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )}
        <span data-tour="search" style={{ display: 'inline-flex', flex: 'none' }}><button type="button" aria-label="Search" title="Search across projects (Ctrl/Cmd+K)" onClick={onSearch} style={iconBtn}><Search size={14} /></button></span>
        <span data-tour="help" style={{ display: 'inline-flex', flex: 'none' }}><button type="button" aria-label="Help" title="Help" onClick={onHelp} style={iconBtn}><HelpCircle size={14} /></button></span>
        <span data-tour="project-menu" style={{ display: 'inline-flex', flex: 'none' }}><button type="button" aria-haspopup="menu" title="Export, import, people and project settings" onClick={onMore} style={iconBtn}><MoreHorizontal size={14} /> More</button></span>
      </div>
      {tabs.length > 0 && (
        <div role="tablist" aria-label="Project views" style={{ display: 'flex', gap: 20, padding: '0 16px', overflowX: 'auto' }}>
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.active} data-tour={'tab-' + t.id} onClick={() => onTab(t.id)} style={{
              border: 'none', background: 'none', cursor: 'pointer', padding: '8px 0 9px', whiteSpace: 'nowrap',
              fontFamily: FONT_STACK, fontSize: 13, fontWeight: t.active ? 600 : 400,
              color: t.active ? TOK.ink : TOK.muted, borderBottom: '2px solid ' + (t.active ? TOK.accent : 'transparent'),
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {t.label}
              {t.count > 0 && <span style={{ fontSize: 11, color: TOK.muted, fontWeight: 400 }}>{t.count}</span>}
              {t.badge > 0 && <span title={`${t.badge} pending approval${t.badge === 1 ? '' : 's'}`} style={{ padding: '0 6px', borderRadius: 999, background: TOK.inprogFg, color: '#fff', fontSize: 10, fontWeight: 600, lineHeight: '15px' }}>{t.badge}</span>}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
