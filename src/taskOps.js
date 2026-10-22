// B4 fix: build an updated task from the CURRENT project state (not a stale
// closure copy), changing only its status. Used by the My Work Undo toast.
export function taskWithStatus(project, taskId, status) {
  for (const pg of project?.programs || [])
    for (const ws of pg.workstreams || [])
      for (const t of ws.tasks || [])
        if (t.id === taskId) return { ...t, status };
  return null;
}
