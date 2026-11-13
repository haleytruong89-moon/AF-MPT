// Backups/exports must never carry the Google Chat webhook (a bearer secret).
const SECRET_KEYS = ['googleChatWebhook'];

export function stripSecrets(project) {
  if (!project || typeof project !== 'object') return project;
  const out = { ...project };
  for (const k of SECRET_KEYS) delete out[k];
  return out;
}

export function stripSecretsFromProjects(projects) {
  const out = {};
  for (const [pid, p] of Object.entries(projects || {})) out[pid] = stripSecrets(p);
  return out;
}

// Restore: the live webhook always wins; an old backup can never reintroduce a
// rotated (leaked) one. No live value -> the field stays absent.
export function projectForRestore(backupProject, liveProject) {
  const out = stripSecrets(backupProject);
  const live = liveProject && liveProject.googleChatWebhook;
  if (live) out.googleChatWebhook = live;
  return out;
}
