// Role assignment: PM / Deputy / Sub-PM shown in Outline headers and the Roles modal.
// Not editable -> "PM: <name>" text; editable -> compact select (None + people).
// Who may edit and who is listed come from src/roleAssign.js (canEditRole, pickerPeople).
import { TOK, FONT_STACK } from '../theme.js';
const FONT = FONT_STACK;
const C = {
  ink: TOK.ink, muted: TOK.muted, surface: TOK.surface, lineStrong: TOK.lineStrong,
  inactiveFg: TOK.droppedFg, inactiveBg: TOK.droppedBg,
};

function InactiveBadge() {
  return (
    <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 999, color: C.inactiveFg, background: C.inactiveBg }}>
      inactive
    </span>
  );
}

export function RolePicker({
  label, valueUid = null, editable = false, people = [], nameOf = (u) => u, isActive = () => true,
  blankText = '—', scopeName = '', onPick, note = null,
}) {
  const inactive = !!valueUid && !isActive(valueUid);
  const wrap = { display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: FONT, fontSize: 11, color: C.muted, whiteSpace: 'nowrap' };

  if (!editable) {
    return (
      <span style={wrap}>
        <span>{label}:</span>
        <span style={{ color: C.ink }}>{valueUid ? nameOf(valueUid) : blankText}</span>
        {inactive && <InactiveBadge />}
      </span>
    );
  }

  const listed = !valueUid || people.some((p) => p.uid === valueUid);
  return (
    <span style={wrap} onClick={(e) => e.stopPropagation()}>
      <span>{label}:</span>
      <select
        value={valueUid || ''}
        onChange={(e) => onPick && onPick(e.target.value || null)}
        aria-label={`${label} of ${scopeName}`}
        title={note || (valueUid ? undefined : blankText)}
        style={{ fontFamily: FONT, fontSize: 11, padding: '2px 4px', borderRadius: 6, border: '1px solid ' + C.lineStrong, background: C.surface, color: C.ink, maxWidth: 160 }}>
        <option value="">None</option>
        {!listed && <option value={valueUid}>{nameOf(valueUid)}{inactive ? ' (inactive)' : ''}</option>}
        {people.map((p) => <option key={p.uid} value={p.uid}>{p.name || p.email || p.uid}</option>)}
      </select>
      {inactive && <InactiveBadge />}
    </span>
  );
}

export default RolePicker;
