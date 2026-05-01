// Walkthrough step config. Edit copy here; logic lives in useWalkthrough.ts
// and rendering in Walkthrough.jsx.

export type StepBase = {
  id: string;
  title: string;
  body: string;
};

export type ModalStep = StepBase & {
  type: 'modal';
  primaryCta: string;
  secondaryCta?: string; // e.g., "Skip tour" on step 1
};

export type SpotlightStep = StepBase & {
  type: 'spotlight';
  target: string; // matches data-tour="..." attribute
  placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
  requireView?: 'mindmap'; // force-switch view before showing
  fallbackNote?: string; // shown when target element not found
  primaryCta: string;
};

export type BranchStep = StepBase & {
  type: 'branch';
  continueLabel: string;
  skipLabel: string;
};

export type Step = ModalStep | SpotlightStep | BranchStep;

export const STEPS: Step[] = [
  {
    id: 'welcome',
    type: 'modal',
    title: 'Welcome to AFMPT!',
    body: 'This tracker organizes your work as: Project → Programs → Workstreams → Tasks. Let’s take a quick 1-minute tour.',
    primaryCta: 'Start tour',
    secondaryCta: 'Skip tour',
  },
  {
    id: 'view-tabs',
    type: 'spotlight',
    target: 'view-tabs',
    placement: 'bottom',
    title: 'Switching views',
    body: 'AFMPT has multiple views of the same project. Mind Map is the visual canvas, Outline edits the tree, Dashboard shows stats. Try clicking between them later.',
    primaryCta: 'Next',
  },
  {
    id: 'first-task',
    type: 'spotlight',
    target: 'first-task',
    requireView: 'mindmap',
    placement: 'auto',
    title: 'Click a task to open details',
    body: 'Inside, you can log check-ins, change status, set dates, and @mention teammates — they’ll see it in the activity feed.',
    fallbackNote: 'This step is about clicking a task — try it once you’ve added one.',
    primaryCta: 'Next',
  },
  {
    id: 'branch',
    type: 'branch',
    title: 'You’ve got the basics!',
    body: 'Want to see the advanced features (search, members, action items)?',
    continueLabel: 'Show me more',
    skipLabel: 'Skip — I’ll explore',
  },
  {
    id: 'search',
    type: 'spotlight',
    target: 'search',
    placement: 'bottom',
    title: 'Quick search',
    body: 'Press Ctrl+K (Cmd+K on Mac) anywhere to jump to any task or project instantly.',
    primaryCta: 'Next',
  },
  {
    id: 'members',
    type: 'spotlight',
    target: 'members',
    placement: 'bottom',
    title: 'Members & roles',
    body: 'Each project has roles: Owner (manages membership), Operator (edits content), Viewer (read-only). Click the people icon to manage.',
    fallbackNote: 'You’ll see this when you’re a member with permissions.',
    primaryCta: 'Next',
  },
  {
    id: 'specialty-tabs',
    type: 'spotlight',
    target: 'view-tabs',
    placement: 'bottom',
    title: 'Beyond tasks',
    body: 'Use the Decisions, Actions, and Aggregation tabs for decision logs, action items with PIC, and cross-project rollups. The ▶ Meeting button (right of tabs) launches a presentation mode for stand-ups with auto-generated minutes.',
    primaryCta: 'Next',
  },
  {
    id: 'closing',
    type: 'modal',
    title: 'You’re all set!',
    body: 'Click the ? icon in the header anytime to replay this tour. Happy tracking!',
    primaryCta: 'Got it',
  },
];

export const BRANCH_STEP_INDEX = STEPS.findIndex((s) => s.type === 'branch');
export const FIRST_ADVANCED_STEP_INDEX = BRANCH_STEP_INDEX + 1;
