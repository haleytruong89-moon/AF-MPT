// Owner-only people directory: add (invite), edit, deactivate/reactivate.
// Writes go through data.ts helpers; nothing is ever deleted.

import React, { useMemo, useState } from 'react';
import { X, Plus, Edit2, Search } from 'lucide-react';
import {
  upsertInvite,
  updateDirectoryEntry,
  setDirectoryStatus,
  type DirectoryEntry,
} from '../data';
import { parseAliases, validateNewPerson, aliasConflictFor, filterDirectory } from '../directory.js';

const TOK = {
  bg: '#F7F5EF',
  surface: '#FFFFFF',
  ink: '#1A1A19',
  muted: '#6E6C66',
  line: 'rgba(26,26,25,0.10)',
  lineStrong: 'rgba(26,26,25,0.22)',
  accent: '#3B6D11',
  danger: '#A32D2D',
  inprogFg: '#A8660C',
  inprogBg: '#FAEEDA',
};
const FONT_STACK =
  '"Geist","Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
const SAVE_FAILED = 'Couldn’t save the directory change. Check your connection and try again.';

interface Props {
  entries: DirectoryEntry[];
  onChanged: () => void;
  onClose: () => void;
  ownerEmail: string;
  showToast?: (msg: string) => void;
}

const inputStyle: React.CSSProperties = {
  fontFamily: FONT_STACK,
  fontSize: 12,
  padding: '6px 8px',
  border: '1px solid ' + TOK.lineStrong,
  borderRadius: 6,
  background: TOK.surface,
  color: TOK.ink,
  boxSizing: 'border-box',
  width: '100%',
};
const btnStyle: React.CSSProperties = {
  fontFamily: FONT_STACK,
  fontSize: 12,
  padding: '5px 10px',
  border: '1px solid ' + TOK.lineStrong,
  borderRadius: 6,
  background: TOK.surface,
  color: TOK.ink,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};
const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: TOK.muted, fontWeight: 500, padding: '6px 8px' };
const td: React.CSSProperties = { padding: '7px 8px', fontSize: 12, verticalAlign: 'top', borderTop: '1px solid ' + TOK.line };

export function DirectoryModal({ entries, onChanged, onClose, ownerEmail, showToast }: Props) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editPath, setEditPath] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', displayName: '', department: '', aliases: '' });
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      filterDirectory(entries, q)
        .slice()
        .sort((a: DirectoryEntry, b: DirectoryEntry) => (a.displayName || a.email).localeCompare(b.displayName || b.email, 'vi')),
    [entries, q]
  );

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setError(null);
      setAdding(false);
      setEditPath(null);
      onChanged();
    } catch (e) {
      console.warn('Directory write failed:', e);
      showToast?.(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  };

  const startAdd = () => {
    setForm({ email: '', displayName: '', department: '', aliases: '' });
    setError(null);
    setEditPath(null);
    setAdding(true);
  };
  const startEdit = (e: DirectoryEntry) => {
    setForm({ email: e.email, displayName: e.displayName, department: e.department, aliases: e.aliases.join(', ') });
    setError(null);
    setAdding(false);
    setEditPath(e.path);
  };

  const submitAdd = () => {
    const err = validateNewPerson(form.email, entries);
    if (err) return setError(err);
    const person = {
      email: form.email.trim().toLowerCase(),
      displayName: form.displayName.trim(),
      department: form.department.trim(),
      aliases: parseAliases(form.aliases),
    };
    if (!person.displayName) return setError('Name is required');
    const conflict = aliasConflictFor(entries, { ...person, path: '', uid: null, status: 'active' });
    if (conflict) return setError(`Alias "${conflict.alias}" is already used by ${conflict.other}`);
    void run(() => upsertInvite(person, ownerEmail));
  };

  const submitEdit = (entry: DirectoryEntry) => {
    const fields = {
      displayName: form.displayName.trim(),
      department: form.department.trim(),
      aliases: parseAliases(form.aliases),
    };
    if (!fields.displayName) return setError('Name is required');
    const conflict = aliasConflictFor(entries, { ...entry, ...fields });
    if (conflict) return setError(`Alias "${conflict.alias}" is already used by ${conflict.other}`);
    void run(() => updateDirectoryEntry(entry.path, fields, ownerEmail));
  };

  const formFields = (emailEditable: boolean) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '8px 0' }}>
      <input style={{ ...inputStyle, opacity: emailEditable ? 1 : 0.6 }} placeholder="email@smartosc.com" value={form.email}
        disabled={!emailEditable} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input style={inputStyle} placeholder="Name" value={form.displayName}
        onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      <input style={inputStyle} placeholder="Department" value={form.department}
        onChange={(e) => setForm({ ...form, department: e.target.value })} />
      <input style={inputStyle} placeholder="Aliases (comma-separated)" value={form.aliases}
        onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
    </div>
  );
  const errorBox = error && (
    <div style={{ padding: '6px 10px', background: TOK.inprogBg, color: TOK.inprogFg, borderRadius: 6, fontSize: 12, marginBottom: 6 }}>{error}</div>
  );

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,14,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, fontFamily: FONT_STACK }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 820, maxWidth: 'calc(100% - 40px)', maxHeight: 'calc(100vh - 60px)', background: TOK.surface, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid ' + TOK.line, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>People directory ({entries.length})</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 4 }} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: TOK.muted }} />
              <input style={{ ...inputStyle, paddingLeft: 26 }} placeholder="Search name, email, department, alias" value={q}
                onChange={(e) => setQ(e.target.value)} />
            </div>
            <button style={btnStyle} onClick={startAdd} disabled={busy}><Plus size={12} /> Add person</button>
          </div>
          {adding && (
            <div style={{ border: '1px solid ' + TOK.line, borderRadius: 8, padding: 10, marginBottom: 10, background: TOK.bg }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>Add person (invite)</div>
              {formFields(true)}
              {errorBox}
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...btnStyle, background: TOK.accent, color: '#fff', borderColor: TOK.accent }} disabled={busy} onClick={submitAdd}>Add</button>
                <button style={btnStyle} onClick={() => { setAdding(false); setError(null); }}>Cancel</button>
              </div>
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr><th style={th}>Name</th><th style={th}>Email</th><th style={th}>Department</th><th style={th}>Aliases</th><th style={th}>Status</th><th style={th}></th></tr>
            </thead>
            <tbody>
              {rows.map((e: DirectoryEntry) =>
                editPath === e.path ? (
                  <tr key={e.path}>
                    <td style={td} colSpan={6}>
                      {formFields(false)}
                      {errorBox}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={{ ...btnStyle, background: TOK.accent, color: '#fff', borderColor: TOK.accent }} disabled={busy} onClick={() => submitEdit(e)}>Save</button>
                        <button style={btnStyle} onClick={() => { setEditPath(null); setError(null); }}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={e.path} style={{ opacity: e.status === 'deactivated' ? 0.55 : 1 }}>
                    <td style={td}>{e.displayName || '—'}{!e.uid && <span style={{ color: TOK.muted }}> (invited)</span>}</td>
                    <td style={td}>{e.email}</td>
                    <td style={td}>{e.department}</td>
                    <td style={td}>{e.aliases.join(', ')}</td>
                    <td style={td}>{e.status === 'deactivated' ? 'Deactivated' : 'Active'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button style={btnStyle} disabled={busy} onClick={() => startEdit(e)}><Edit2 size={11} /> Edit</button>{' '}
                      <button style={btnStyle} disabled={busy}
                        onClick={() => void run(() => setDirectoryStatus(e, e.status === 'deactivated' ? 'active' : 'deactivated', ownerEmail))}>
                        {e.status === 'deactivated' ? 'Reactivate' : 'Deactivate'}
                      </button>
                    </td>
                  </tr>
                )
              )}
              {rows.length === 0 && (
                <tr><td style={{ ...td, color: TOK.muted, textAlign: 'center' }} colSpan={6}>No matching people.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
