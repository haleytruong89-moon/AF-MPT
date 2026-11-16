// W3-D2: filter the full activity log (Owner). Pure.
const day = (s) => {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const dateOnly = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

/** entries newest first; from / to = 'YYYY-MM-DD', inclusive local dates. */
export function filterActivity(entries, { projectId = '', person = '', types = [], from = '', to = '', text = '' } = {}) {
  const who = String(person || '').trim().toLowerCase();
  const q = String(text || '').trim().toLowerCase();
  const f = dateOnly(from);
  const t = dateOnly(to);
  const typeSet = new Set((types || []).filter(Boolean));
  return (entries || [])
    .filter((e) => {
      if (!e) return false;
      if (projectId && e.projectId !== projectId) return false;
      if (who && !String(e.author || '').toLowerCase().includes(who)) return false;
      if (typeSet.size && !typeSet.has(e.type)) return false;
      if (q && !String(e.description || '').toLowerCase().includes(q)) return false;
      if (f || t) {
        const d = day(e.timestamp);
        if (!d) return false;
        if (f && d < f) return false;
        if (t && d > t) return false;
      }
      return true;
    })
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
}

export function activityTypes(entries) {
  return [...new Set((entries || []).map((e) => e?.type).filter(Boolean))].sort();
}
