// The only place colours and fonts are defined (spec docs/superpowers/specs/2026-11-27-nav-shell-design.md).
// Part 1 keeps the values App.jsx had; Part 2 changes the values here only.
export const TOK = {
  bg: '#F7F5EF', surface: '#FFFFFF', ink: '#1A1A19', muted: '#6E6C66', subtle: '#706E68',
  line: 'rgba(26,26,25,0.10)', lineStrong: 'rgba(26,26,25,0.22)',
  accent: '#3B6D11',
  plannedFg: '#6E6C66', plannedBg: '#EDEBE4',
  inprogFg: '#A8660C', inprogBg: '#FAEEDA',
  doneFg: '#356512', doneBg: '#E6EFD6',
  droppedFg: '#7A7873', droppedBg: '#F0EEE8',
  overdueFg: '#A32D2D', overdueBg: '#FCEBEB',
  programFg: '#0C447C', programBg: '#E6F1FB',
  workstreamFg: '#0F6E56', workstreamBg: '#E1F5EE',
  projectFg: '#26215C', projectBg: '#EEEDFE',
  // Health (RAG)
  healthGreen: '#2D7A2D', healthGreenBg: '#E2F0DE',
  healthAmber: '#8A5A12', healthAmberBg: '#FBF1DC',
  healthRed: '#A32D2D', healthRedBg: '#FCEBEB',
  // Mention highlight
  mention: '#1F5EA8', mentionBg: '#E5EFFB',
  blocker: '#A32D2D', blockerBg: '#FCEBEB',
  // Used by the modals (DirectoryModal danger, SearchModal highlight)
  danger: '#A32D2D', hl: '#FAEEDA',
};

// Sidebar (new in Part 1; SmartOSC navy from the start).
export const NAV = { bg: '#0F1B33', hover: '#1A2A4A', fg: '#C3D2EA', muted: '#88A6D6', activeFg: '#FFFFFF', width: 240 };

export const FONT_STACK = '"Geist","Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
