// P3 Task 7: the task panel's status block on a v2 project (P3-1 .. P3-7).
// Every button goes through onUpdate -> App applyTaskUpdate (the choke point):
// raw status changes are turned into submit / direct / approve / withdraw /
// reopen there; Reject and Reassign are prepared here (closeFlow) and pass the
// choke point as 'prepared'. View as (readOnly) shows the pill only.
import { useContext } from 'react';
import { MeContext } from './meContext';
import { applyCloseIntent, reassignClose } from '../closeFlow.js';
import { closeControlModel } from '../closeWiring.js';

const FONT = '"Geist","Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
const C = {
  ink: '#1A1A19', muted: '#6E6C66', surface: '#FFFFFF', lineStrong: 'rgba(26,26,25,0.22)',
  Planned: { fg: '#6E6C66', bg: '#EDEBE4' },
  InProgress: { fg: '#A8660C', bg: '#FAEEDA' },
  Completed: { fg: '#356512', bg: '#E6EFD6' },
  Dropped: { fg: '#7A7873', bg: '#F0EEE8' },
  Submitted: { fg: '#8A5A0B', bg: '#FAEEDA' },
};
const LABEL = {
  Planned: 'Planned', InProgress: 'In Progress', Completed: 'Completed', Dropped: 'Dropped',
  'submit-done': 'Submit as done', 'submit-dropped': 'Submit as dropped',
  withdraw: 'Withdraw', approve: 'Approve', reject: 'Reject', reopen: 'Reopen',
};

function fmtDay(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? String(iso).slice(0, 10) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusButton({ id, active, onClick, primary }) {
  const m = C[id] || (primary ? C.Completed : C.Planned);
  return (
    <button type="button" onClick={onClick} style={{
      flex: '1 1 100px', fontFamily: FONT, fontSize: 12, fontWeight: 500, padding: '6px 8px', borderRadius: 7,
      border: '1px solid ' + (active ? m.fg : C.lineStrong),
      background: active ? m.bg : C.surface, color: active ? m.fg : C.ink, cursor: 'pointer',
    }}>{LABEL[id] || id}</button>
  );
}

function Chip({ status, children }) {
  const m = C[status] || C.Planned;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500,
      padding: '5px 10px', borderRadius: 999, color: m.fg, background: m.bg,
    }}>{children}</span>
  );
}

export function CloseControl({ task, roles, onUpdate, dialogs }) {
  const me = useContext(MeContext);
  const model = closeControlModel({ task, roles, me, readOnly: me.readOnly, isActive: me.isActive });
  const { kind, status, buttons, pending, reassignTargets } = model;
  const cr = task.closeRequest || {};
  const now = () => new Date().toISOString();

  const click = async (id) => {
    if (id === 'Planned' || id === 'InProgress' || id === 'Completed' || id === 'Dropped') {
      if (id !== status) onUpdate({ ...task, status: id });
      return;
    }
    if (id === 'submit-done') return onUpdate({ ...task, status: 'Completed' });
    if (id === 'submit-dropped') return onUpdate({ ...task, status: 'Dropped' });
    if (id === 'approve') return onUpdate({ ...task, status: cr.outcome });
    if (id === 'withdraw') return onUpdate({ ...task, status: cr.prevStatus === 'Planned' ? 'Planned' : 'InProgress' });
    if (id === 'reopen') return onUpdate({ ...task, status: 'InProgress' });
    if (id === 'reject') {
      if (!dialogs) return;
      const reason = await dialogs.prompt({
        title: 'Reject close request?',
        message: `The task goes back to In Progress. Tell ${me.nameOf(cr.requestedByUid) || 'the requester'} why (required).`,
        placeholder: 'e.g., Deliverable missing the signed copy',
        okLabel: 'Reject',
        allowEmpty: false,
      });
      if (reason === null || reason === undefined) return;
      const r = applyCloseIntent({ roles, oldTask: task, nextTask: { ...task, status: 'InProgress' }, me: { uid: me.uid, name: me.name }, now: now(), reason });
      // 'denied' / 'needs-reason' are reported by the choke point.
      onUpdate(r.outcome === 'reject' ? r.task : { ...task, status: 'InProgress' });
    }
  };

  const reassign = (toUid) => {
    if (!toUid) return;
    const t = reassignClose({ roles, task, me: { uid: me.uid, name: me.name }, toUid, now: now() });
    if (t) onUpdate(t);
  };

  return (
    <div>
      {kind === 'submitted' && (
        <div style={{ marginBottom: buttons.length ? 8 : 0 }}>
          <Chip status="Submitted">
            Pending approval · {me.nameOf(pending.approverUid) || '—'} · since {fmtDay(pending.submittedAt)}
          </Chip>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            {cr.outcome === 'Dropped' ? 'Submitted as dropped' : 'Submitted as done'}
            {cr.requestedByUid ? ` by ${me.nameOf(cr.requestedByUid)}` : ''}
          </div>
        </div>
      )}
      {kind === 'closed' && (
        <div style={{ marginBottom: buttons.length ? 8 : 0 }}>
          <Chip status={status}>{LABEL[status] || status}</Chip>
        </div>
      )}
      {kind === 'open' && me.readOnly && <Chip status={status}>{LABEL[status] || status}</Chip>}
      {buttons.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {buttons.filter((b) => b !== 'reassign').map((b) => (
            <StatusButton key={b} id={b} active={kind === 'open' && b === status}
              primary={b === 'approve' || b.startsWith('submit')} onClick={() => click(b)} />
          ))}
          {buttons.includes('reassign') && (
            <select value="" onChange={(e) => reassign(e.target.value)} aria-label="Reassign approver"
              style={{ flex: '1 1 140px', fontFamily: FONT, fontSize: 12, padding: '6px 8px', borderRadius: 7, border: '1px solid ' + C.lineStrong, background: C.surface, color: C.ink }}>
              <option value="">Reassign…</option>
              {reassignTargets.map((u) => <option key={u} value={u}>{me.nameOf(u)}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

export default CloseControl;
