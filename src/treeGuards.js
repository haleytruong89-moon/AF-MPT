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
