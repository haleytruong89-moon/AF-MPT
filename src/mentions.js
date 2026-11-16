// W3-B3 (M2): does a comment @-mention me? Pure.
// A mention is "@" followed by 1-4 words (same word pattern as findMentions in App.jsx).
// For each "@", the 4-, 3-, 2-, then 1-word candidate is tried against isMe
// (directory-aware: username, display name, alias, email local-part, diacritics folded).
// Without a directory isMe is exact, so the 1-word token is also compared
// case-insensitively with `author` (the pre-W3 behaviour).
const WORD = '[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ0-9._-]*';
const MENTION = new RegExp(`@(${WORD}(?:[ \\t]+${WORD}){0,3})`, 'g');

export function mentionsMe(text, isMe, author = null) {
  if (!text || typeof isMe !== 'function') return false;
  const authorLc = author ? String(author).toLowerCase() : null;
  for (const m of String(text).matchAll(MENTION)) {
    const words = m[1].split(/[ \t]+/);
    for (let n = Math.min(words.length, 4); n >= 1; n--) {
      const cand = words.slice(0, n).join(' ').replace(/[._-]+$/, '');
      if (!cand) continue;
      if (isMe(cand)) return true;
      if (n === 1 && authorLc && cand.toLowerCase() === authorLc) return true;
    }
  }
  return false;
}
