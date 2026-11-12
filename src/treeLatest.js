// Lookups on the latest project state, used by menu actions that await a dialog:
// the node captured when the menu opened may have changed or been deleted meanwhile.
export function findProgram(project, programId) {
  return ((project && project.programs) || []).find((p) => p.id === programId) || null;
}

export function findWorkstream(project, programId, workstreamId) {
  const pg = findProgram(project, programId);
  return ((pg && pg.workstreams) || []).find((w) => w.id === workstreamId) || null;
}
