// Workspace-owner helpers (B1). Pure functions; owner identity is a verified
// email compared case-insensitively. Display names are never accepted.

const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

export function isWorkspaceOwnerEmail(workspaceOwner, email) {
  const owner = norm(workspaceOwner);
  const me = norm(email);
  return owner !== '' && me !== '' && owner.includes('@') && owner === me;
}

export function transferCandidates(projects, teamMembers, currentOwner) {
  const owner = norm(currentOwner);
  const byEmail = new Map();
  const add = (m) => {
    const email = norm(m && m.email);
    if (!email || !email.includes('@') || email === owner || byEmail.has(email)) return;
    byEmail.set(email, { name: m.name || email, email });
  };
  for (const p of Object.values(projects || {})) for (const m of p.teamMembers || []) add(m);
  for (const m of teamMembers || []) add(m);
  return Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name));
}
