// Member management modal for the current project.
//
// Subscribes to the FULL project doc via useProject() — including memberIds
// and roles which the storage-shim hides from the App.jsx side. Uses the
// data.ts helpers (addProjectMember / setMemberRole / removeProjectMember /
// setRelatedParties) which spread the full project, modify only the
// membership/parties fields, and save via saveProject (preserving every
// other field new App.jsx may have written: programs, decisions, actionItems,
// updates, health, etc.).
//
// Permission gating mirrors the Firestore rules:
//   - Members tab: owners can change roles + add/remove. Non-owners read-only.
//   - Related parties tab: any operator+ can edit (rule allows operator to
//     update non-ACL fields).

import React, { useMemo, useState } from 'react';
import { Users, UserCircle, Plus, X, ShieldCheck, Edit2, Eye } from 'lucide-react';
import {
  useProject,
  useUserDirectory,
  addProjectMember,
  setMemberRole,
  removeProjectMember,
  setRelatedParties,
  ROLE,
  isOwner,
  roleOf,
} from '../data';
import type { Project, Role, RelatedParty, UserDirEntry } from '../types';

const TOK = {
  bg: '#F7F5EF',
  surface: '#FFFFFF',
  ink: '#1A1A19',
  muted: '#6E6C66',
  subtle: '#95938C',
  line: 'rgba(26,26,25,0.10)',
  lineStrong: 'rgba(26,26,25,0.22)',
  accent: '#3B6D11',
  inprogFg: '#A8660C',
  inprogBg: '#FAEEDA',
  workstreamFg: '#0F6E56',
  workstreamBg: '#E1F5EE',
  projectFg: '#26215C',
  projectBg: '#EEEDFE',
};
const FONT_STACK =
  '"Geist","Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

interface Props {
  projectId: string;
  currentUserId: string;
  /** Workspace Owner (uid in ownerUids or workspaceOwner email): Owner of every project here. */
  isWorkspaceOwner?: boolean;
  onClose: () => void;
  showToast?: (msg: string) => void;
}

export function MembersModal({ projectId, currentUserId, isWorkspaceOwner = false, onClose, showToast }: Props) {
  const { project, loading } = useProject(projectId);
  const directory = useUserDirectory();
  const [tab, setTab] = useState<'members' | 'parties'>('members');

  if (loading || !project) {
    return (
      <Backdrop onClose={onClose}>
        <Frame onClose={onClose} title="Members & related parties">
          <div style={{ padding: 30, textAlign: 'center', color: TOK.muted, fontSize: 13 }}>
            {loading ? 'Loading…' : 'Project not accessible.'}
          </div>
        </Frame>
      </Backdrop>
    );
  }

  const amIOwner = isWorkspaceOwner || isOwner(project, currentUserId);

  return (
    <Backdrop onClose={onClose}>
      <Frame onClose={onClose} title={`Members — ${project.name}`}>
        {!amIOwner && (
          <div
            style={{
              marginBottom: 12,
              padding: '8px 12px',
              background: TOK.inprogBg,
              color: TOK.inprogFg,
              borderRadius: 7,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            You are not an owner. You can view the list but not change membership or roles.
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 3,
            background: TOK.bg,
            borderRadius: 8,
            marginBottom: 14,
            width: 'fit-content',
          }}
        >
          {[
            {
              id: 'members' as const,
              label: `Members (${(project.memberIds || []).length})`,
              icon: <Users size={12} />,
            },
            {
              id: 'parties' as const,
              label: `Related parties (${(project.relatedParties || []).length})`,
              icon: <UserCircle size={12} />,
            },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                fontFamily: FONT_STACK,
                fontSize: 12,
                fontWeight: 500,
                padding: '5px 12px',
                borderRadius: 6,
                border: 'none',
                background: tab === t.id ? TOK.surface : 'transparent',
                color: TOK.ink,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                boxShadow: tab === t.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'members' ? (
          <MembersTab
            project={project}
            directory={directory}
            currentUserId={currentUserId}
            amIOwner={amIOwner}
            showToast={showToast}
          />
        ) : (
          <PartiesTab project={project} amIOwner={amIOwner} showToast={showToast} />
        )}
      </Frame>
    </Backdrop>
  );
}

/* ─────── Members tab ─────── */
function MembersTab({
  project,
  directory,
  currentUserId,
  amIOwner,
  showToast,
}: {
  project: Project;
  directory: UserDirEntry[];
  currentUserId: string;
  amIOwner: boolean;
  showToast?: (msg: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  const memberEntries = useMemo(() => {
    const dirByUid = Object.fromEntries(directory.map((u) => [u.uid, u]));
    return (project.memberIds || []).map((uid) => ({
      ...(dirByUid[uid] || { uid, name: '(unknown user)', email: '', photo: null }),
      uid,
      role: roleOf(project, uid) || ROLE.MEMBER,
    }));
  }, [project, directory]);

  const candidatePool = useMemo(() => {
    const have = new Set(project.memberIds || []);
    const q = pickerQuery.trim().toLowerCase();
    return directory
      .filter((u) => !have.has(u.uid))
      .filter(
        (u) =>
          !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
      );
  }, [directory, project.memberIds, pickerQuery]);

  const handleAdd = async (entry: UserDirEntry, role: Role) => {
    try {
      await addProjectMember(project, entry, role);
      showToast?.(`Added ${entry.name || entry.email}`);
      setPickerOpen(false);
      setPickerQuery('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      alert(`Add failed: ${msg}`);
    }
  };

  const handleRoleChange = async (uid: string, role: Role) => {
    if (uid === currentUserId && role !== ROLE.OWNER) {
      const ownerCount = memberEntries.filter((m) => m.role === ROLE.OWNER).length;
      if (ownerCount <= 1) {
        alert('Cannot demote yourself — every project must have at least one owner.');
        return;
      }
      if (!confirm('You are removing your own owner role. Continue?')) return;
    }
    try {
      await setMemberRole(project, uid, role);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      alert(`Role change failed: ${msg}`);
    }
  };

  const handleRemove = async (uid: string, name: string, role: Role) => {
    if (role === ROLE.OWNER) {
      const ownerCount = memberEntries.filter((m) => m.role === ROLE.OWNER).length;
      if (ownerCount <= 1) {
        alert('Cannot remove the last owner. Promote someone else first.');
        return;
      }
    }
    if (!confirm(`Remove ${name} from this project? They will lose access immediately.`)) return;
    try {
      await removeProjectMember(project, uid);
      showToast?.('Member removed');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      alert(`Remove failed: ${msg}`);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {memberEntries.map((m) => (
          <div
            key={m.uid}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              border: '1px solid ' + TOK.line,
              borderRadius: 8,
            }}
          >
            {m.photo ? (
              <img src={m.photo} alt="" style={{ width: 26, height: 26, borderRadius: 999 }} />
            ) : (
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: TOK.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <UserCircle size={16} color={TOK.muted} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {m.name}
                {m.uid === currentUserId && (
                  <span style={{ color: TOK.subtle, fontWeight: 400 }}> · you</span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: TOK.muted,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.email}
              </div>
            </div>
            {amIOwner ? (
              <select
                value={m.role}
                onChange={(e) => handleRoleChange(m.uid, e.target.value as Role)}
                style={{
                  fontFamily: FONT_STACK,
                  fontSize: 12,
                  padding: '4px 22px 4px 8px',
                  border: '1px solid ' + TOK.lineStrong,
                  borderRadius: 6,
                  background: TOK.surface,
                  color: TOK.ink,
                  cursor: 'pointer',
                }}
              >
                <option value={ROLE.OWNER}>Owner</option>
                <option value={ROLE.OPERATOR}>Operator</option>
                <option value={ROLE.MEMBER}>Viewer</option>
              </select>
            ) : (
              <RoleBadge role={m.role} />
            )}
            {amIOwner && (
              <button
                onClick={() => handleRemove(m.uid, m.name || m.email || m.uid, m.role)}
                title="Remove"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: TOK.muted,
                  padding: 4,
                  display: 'flex',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {amIOwner && (
        <>
          {!pickerOpen ? (
            <button onClick={() => setPickerOpen(true)} style={btnStyle()}>
              <Plus size={12} /> Add member
            </button>
          ) : (
            <div
              style={{
                border: '1px solid ' + TOK.lineStrong,
                borderRadius: 8,
                padding: 10,
                background: TOK.bg,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 500, color: TOK.muted, marginBottom: 4 }}>
                Find a teammate
              </div>
              <input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search by name or email…"
                autoFocus
                style={inputStyle()}
              />
              <div
                style={{
                  marginTop: 8,
                  maxHeight: 200,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {candidatePool.length === 0 && (
                  <div style={{ fontSize: 12, color: TOK.subtle, padding: 8, textAlign: 'center' }}>
                    No matching teammates. They need to sign in to the app at least once first.
                  </div>
                )}
                {candidatePool.slice(0, 30).map((u) => (
                  <div
                    key={u.uid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      background: TOK.surface,
                      borderRadius: 6,
                    }}
                  >
                    {u.photo ? (
                      <img
                        src={u.photo}
                        alt=""
                        style={{ width: 22, height: 22, borderRadius: 999 }}
                      />
                    ) : (
                      <UserCircle size={20} color={TOK.muted} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{u.name}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: TOK.muted,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {u.email}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAdd(u, ROLE.MEMBER)}
                      style={smallBtnStyle()}
                      title="Add as Viewer"
                    >
                      + Viewer
                    </button>
                    <button
                      onClick={() => handleAdd(u, ROLE.OPERATOR)}
                      style={smallBtnStyle()}
                      title="Add as Operator"
                    >
                      + Operator
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setPickerOpen(false);
                    setPickerQuery('');
                  }}
                  style={btnStyle()}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ─────── Related parties tab ─────── */
function PartiesTab({
  project,
  amIOwner,
  showToast,
}: {
  project: Project;
  amIOwner: boolean;
  showToast?: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<RelatedParty>({
    name: '',
    email: '',
    role: '',
    organization: '',
  });

  const handleAdd = async () => {
    const trimmed: RelatedParty = {
      name: draft.name.trim(),
      email: draft.email?.trim(),
      role: draft.role?.trim(),
      organization: draft.organization?.trim(),
    };
    if (!trimmed.name) return;
    const next = [...(project.relatedParties || []), trimmed];
    try {
      await setRelatedParties(project, next);
      setDraft({ name: '', email: '', role: '', organization: '' });
      showToast?.('Related party added');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      alert(`Add failed: ${msg}`);
    }
  };

  const handleRemove = async (idx: number) => {
    const next = (project.relatedParties || []).filter((_, i) => i !== idx);
    try {
      await setRelatedParties(project, next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      alert(`Remove failed: ${msg}`);
    }
  };

  return (
    <>
      <div style={{ fontSize: 12, color: TOK.muted, marginBottom: 10, lineHeight: 1.55 }}>
        Related parties are people who don&apos;t have access to the app but should be on the
        record (e.g. clients, vendors, sponsors). They are reference-only — no permissions
        granted.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {(project.relatedParties || []).map((p, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              border: '1px solid ' + TOK.line,
              borderRadius: 8,
            }}
          >
            <UserCircle size={20} color={TOK.muted} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {p.name}
                {p.role && (
                  <span style={{ color: TOK.subtle, fontWeight: 400, fontSize: 11 }}>
                    {' '}
                    · {p.role}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: TOK.muted }}>
                {[p.email, p.organization].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            {amIOwner && (
              <button
                onClick={() => handleRemove(i)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: TOK.muted,
                  padding: 4,
                  display: 'flex',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        {(project.relatedParties || []).length === 0 && (
          <div style={{ fontSize: 12, color: TOK.subtle, padding: 10, textAlign: 'center' }}>
            No related parties yet.
          </div>
        )}
      </div>
      {amIOwner && (
        <div
          style={{
            border: '1px solid ' + TOK.lineStrong,
            borderRadius: 8,
            padding: 12,
            background: TOK.bg,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 500, color: TOK.muted, marginBottom: 4 }}>
            Add related party
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Name *"
              style={inputStyle()}
            />
            <input
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              placeholder="Email"
              style={inputStyle()}
            />
            <input
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              placeholder="Role (e.g. Sponsor)"
              style={inputStyle()}
            />
            <input
              value={draft.organization}
              onChange={(e) => setDraft({ ...draft, organization: e.target.value })}
              placeholder="Organization"
              style={inputStyle()}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleAdd}
              disabled={!draft.name.trim()}
              style={{ ...btnStyle(), background: TOK.ink, color: TOK.surface, opacity: !draft.name.trim() ? 0.4 : 1 }}
            >
              Add party
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ─────── Shared UI ─────── */
function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,15,14,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        fontFamily: FONT_STACK,
      }}
    >
      {children}
    </div>
  );
}

function Frame({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: 620,
        maxWidth: 'calc(100% - 40px)',
        maxHeight: 'calc(100vh - 60px)',
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
          padding: '14px 18px',
          borderBottom: '1px solid ' + TOK.line,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{title}</h3>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TOK.muted, padding: 4 }}
        >
          <X size={18} />
        </button>
      </div>
      <div style={{ padding: 18, overflowY: 'auto' }}>{children}</div>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const map: Record<Role, { fg: string; bg: string; label: string; icon: React.ReactNode }> = {
    [ROLE.OWNER]: {
      fg: TOK.projectFg,
      bg: TOK.projectBg,
      label: 'Owner',
      icon: <ShieldCheck size={10} />,
    },
    [ROLE.OPERATOR]: {
      fg: TOK.workstreamFg,
      bg: TOK.workstreamBg,
      label: 'Operator',
      icon: <Edit2 size={10} />,
    },
    [ROLE.MEMBER]: { fg: TOK.muted, bg: TOK.bg, label: 'Viewer', icon: <Eye size={10} /> },
  };
  const m = map[role] || map[ROLE.MEMBER];
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 500,
        padding: '3px 8px',
        borderRadius: 999,
        color: m.fg,
        background: m.bg,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {m.icon} {m.label}
    </span>
  );
}

function btnStyle(): React.CSSProperties {
  return {
    fontFamily: FONT_STACK,
    fontSize: 12,
    fontWeight: 500,
    padding: '6px 12px',
    borderRadius: 7,
    border: '1px solid ' + TOK.lineStrong,
    background: TOK.surface,
    color: TOK.ink,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };
}
function smallBtnStyle(): React.CSSProperties {
  return {
    fontFamily: FONT_STACK,
    fontSize: 11,
    fontWeight: 500,
    padding: '3px 8px',
    borderRadius: 5,
    border: '1px solid ' + TOK.lineStrong,
    background: TOK.surface,
    color: TOK.ink,
    cursor: 'pointer',
  };
}
function inputStyle(): React.CSSProperties {
  return {
    fontFamily: FONT_STACK,
    fontSize: 12,
    width: '100%',
    padding: '7px 10px',
    border: '1px solid ' + TOK.lineStrong,
    borderRadius: 6,
    background: TOK.surface,
    color: TOK.ink,
    outline: 'none',
  };
}
