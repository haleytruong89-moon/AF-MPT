// The only place colours and fonts are defined (spec docs/superpowers/specs/2026-11-27-nav-shell-design.md).
// SmartOSC BMS look (Part 2): brand blue, cool slate neutrals, navy sidebar, Inter + JetBrains Mono.
// Every text / background pair is checked at 4.5:1 by tests/unit/theme.test.js.
export const TOK = {
  bg: '#F4F7FB', surface: '#FFFFFF', ink: '#11182A', muted: '#475569', subtle: '#5B6B82',
  line: '#E2E8F0', lineStrong: '#CBD5E1',
  accent: '#295CA9',
  plannedFg: '#475569', plannedBg: '#F1F5F9',
  inprogFg: '#92400E', inprogBg: '#FEF3C7',
  doneFg: '#166534', doneBg: '#E6F7EC',
  droppedFg: '#5B6B82', droppedBg: '#F1F5F9',
  overdueFg: '#B91C1C', overdueBg: '#FEE2E2',
  programFg: '#1B4079', programBg: '#E5ECF6',
  workstreamFg: '#0F6E56', workstreamBg: '#E1F5EE',
  projectFg: '#26215C', projectBg: '#EEEDFE',
  // Health (RAG)
  healthGreen: '#166534', healthGreenBg: '#E6F7EC',
  healthAmber: '#92400E', healthAmberBg: '#FEF3C7',
  healthRed: '#B91C1C', healthRedBg: '#FEE2E2',
  // Mention highlight
  mention: '#1B4079', mentionBg: '#E5ECF6',
  blocker: '#B91C1C', blockerBg: '#FEE2E2',
  // Used by the modals (DirectoryModal danger, SearchModal highlight)
  danger: '#B91C1C', hl: '#FEF3C7',
};

// Sidebar: SmartOSC navy.
export const NAV = { bg: '#0F1B33', hover: '#1A2A4A', fg: '#C3D2EA', muted: '#88A6D6', activeFg: '#FFFFFF', width: 240 };

export const FONT_STACK = '"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
// Numbers (cp, %, dates, counts): tabular mono, so columns line up.
export const FONT_NUM = '"JetBrains Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace';
