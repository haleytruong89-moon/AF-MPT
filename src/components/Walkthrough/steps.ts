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
  skipIfMissing?: boolean; // silently skip the step when the target is not on screen
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
    title: 'Welcome to AF-MPT',
    body: 'Plan work as Project → Program → Work stream → Task. This 1-minute tour shows where to find your own work, approvals and roles.',
    primaryCta: 'Start tour',
    secondaryCta: 'Skip tour',
  },
  {
    id: 'my-work',
    type: 'spotlight',
    target: 'tab-my-work',
    placement: 'bottom',
    title: 'My Work',
    body: 'Start here every day. Your tasks are grouped by Today, This week and Later, across all projects.',
    primaryCta: 'Next',
  },
  {
    id: 'needs-approval',
    type: 'spotlight',
    target: 'my-work-needs-approval',
    placement: 'bottom',
    skipIfMissing: true,
    title: 'Needs my approval',
    body: 'Tasks that someone sent as done and you can decide on. Approve, or Reject with a reason.',
    primaryCta: 'Next',
  },
  {
    id: 'sent-approval',
    type: 'spotlight',
    target: 'my-work-sent-approval',
    placement: 'bottom',
    skipIfMissing: true,
    title: 'Sent for approval',
    body: 'Tasks you submitted and are waiting on. You can Withdraw one before it is decided.',
    primaryCta: 'Next',
  },
  {
    id: 'task-panel',
    type: 'spotlight',
    target: 'task-close',
    placement: 'left',
    title: 'Open a task, then Submit as done',
    body: 'Click any task to open its panel. When your part is finished, use Submit as done; your manager then approves it.',
    fallbackNote: 'Open a task from My Work, Outline or Mind map to see this control.',
    primaryCta: 'Next',
  },
  {
    id: 'roles',
    type: 'modal',
    title: 'Who does what',
    body: 'Owner (HOD) sees everything. PM / Deputy run a program, assign Sub-PMs and approve. Sub-PM plans and approves tasks in a work stream. Assignee / PIC does the task and submits it as done.',
    primaryCta: 'Next',
  },
  {
    id: 'role-chip',
    type: 'spotlight',
    target: 'role-chip',
    placement: 'bottom',
    skipIfMissing: true,
    title: 'Your role',
    body: 'This chip shows your highest role in the current project. Hover it to see every role you hold.',
    primaryCta: 'Next',
  },
  {
    id: 'roles-menu',
    type: 'spotlight',
    target: 'project-menu',
    placement: 'bottom',
    title: 'Assigning roles',
    body: 'Open the ⋯ menu and choose Roles… to see or assign PM, Deputy and Sub-PM (Owner and PMs only).',
    primaryCta: 'Next',
  },
  {
    id: 'view-tabs',
    type: 'spotlight',
    target: 'view-tabs',
    placement: 'bottom',
    title: 'Mind map and Outline',
    body: 'Mind map is the visual canvas; Outline edits the same tree as a list. Both show the same project.',
    primaryCta: 'Next',
  },
  {
    id: 'closing',
    type: 'modal',
    title: 'You’re all set',
    body: 'Click the ? icon in the header to replay this walkthrough; it also has a Glossary of terms.',
    primaryCta: 'Done',
  },
];

export const BRANCH_STEP_INDEX = STEPS.findIndex((s) => s.type === 'branch');
export const FIRST_ADVANCED_STEP_INDEX = BRANCH_STEP_INDEX + 1;
