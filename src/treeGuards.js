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

// True when a backup restore would write over a v2 project.
export function restoreTouchesV2(data, loadedProjects) {
  const ids = (data && data.meta && data.meta.projectIds) || [];
  return ids.some((pid) => {
    const bp = data.projects && data.projects[pid];
    if (!bp) return false;
    return bp.schemaVersion === 2 || !!(loadedProjects && loadedProjects[pid] && loadedProjects[pid].__v2);
  });
}
