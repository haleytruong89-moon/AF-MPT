// Deep links: ?project=<pid>&task=<tid> (Copy link) and ?project=&action= (Chat "View").
export function taskUrl(origin, pid, tid) {
  return `${origin}/?project=${encodeURIComponent(pid)}&task=${encodeURIComponent(tid)}`;
}

export function parseDeepLink(search) {
  const p = new URLSearchParams(search || '');
  const get = (k) => p.get(k) || null;
  return { project: get('project'), action: get('action'), task: get('task') };
}
