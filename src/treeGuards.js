// Guards for destructive tree actions (wave 1, A1).
export const DELETE_HAS_TASKS_MESSAGE = 'Move or drop its tasks first. Dropped tasks keep their history.';
export const V2_RESTORE_MESSAGE = 'This project uses the new storage. Ask the Owner to restore it with the restore script (no data is deleted that way).';

// Counts every task (any status) under a program or work stream.
export function taskCountUnder(node) {
  if (!node) return 0;
  let n = Array.isArray(node.tasks) ? node.tasks.length : 0;
  for (const w of node.workstreams || []) n += taskCountUnder(w);
  return n;
}

// Splits the backup's projects into those safe to restore (v1 in the backup and live) and v2 ones.
export function splitRestoreByV2(data, liveProjects) {
  const ids = (data && data.meta && data.meta.projectIds) || [];
  const v1Ids = [];
  const v2Ids = [];
  for (const pid of ids) {
    const bp = data.projects && data.projects[pid];
    if (!bp) continue;
    if (bp.schemaVersion === 2 || !!(liveProjects && liveProjects[pid] && liveProjects[pid].__v2)) v2Ids.push(pid);
    else v1Ids.push(pid);
  }
  return { v1Ids, v2Ids };
}

// Restore writes a project's activity only after its tree was saved and only when the backup has entries,
// so a restore can never empty or replace a log for a project that was not restored.
export function activityToRestore(status, list) {
  return status === 'ok' && Array.isArray(list) && list.length > 0;
}

/**
 * W3-D1 (O7): what a Backup JSON restore would do, before any confirm.
 * -> { v1Names, v2: [{ id, name }], invalid: string | null }
 */
export function restorePreview(data, liveProjects) {
  if (!data || typeof data !== 'object' || !data.meta || !data.projects) return { v1Names: [], v2: [], invalid: 'Invalid backup file.' };
  const { v1Ids, v2Ids } = splitRestoreByV2(data, liveProjects);
  const nameOf = (pid) => (data.projects[pid] && data.projects[pid].name) || pid;
  return { v1Names: v1Ids.map(nameOf), v2: v2Ids.map((id) => ({ id, name: nameOf(id) })), invalid: null };
}

/** W3-D1 (O7): the restore-script command per v2 project (file name quoted). */
export function restoreScriptHint(v2, fileName) {
  const f = String(fileName || 'backup.json').replace(/"/g, '\\"');
  return (v2 || []).map((p) => `npm run p2:restore -- ${p.id} --backup "${f}"`);
}
