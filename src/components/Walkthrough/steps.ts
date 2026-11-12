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

export type Step = ModalStep | SpotlightStep;

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
    body: 'Start here every day. Your tasks are grouped by Today, Week and Later, across all projects.',
    primaryCta: 'Next',
  },
  {
    id: 'approvals',
    type: 'modal',
    title: 'Approvals in My Work',
    body: 'Requests waiting for your approval appear in My Work under "Needs my approval" (the My Work tab shows a count). Your own requests are under "Sent for approval". A request waiting 3+ working days also goes to the next level.',
    primaryCta: 'Next',
  },
  {
    id: 'submit-as-done',
    type: 'modal',
    title: 'Submit as done',
    body: 'Open a task and the PIC uses Submit as done when the work is finished. The manager then approves it, or rejects it with a reason.',
    primaryCta: 'Next',
  },
  {
    id: 'roles',
    type: 'modal',
    title: 'Who does what',
    body: 'The Owner (HOD) sees everything and can approve or close any task. The Owner assigns PM and Deputy; a PM or Deputy assigns the Sub-PM of their program’s work streams and approves. Sub-PM plans and approves tasks in a work stream. Assignee / PIC does the task and submits it as done.',
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
    body: 'Open the ⋯ menu and choose Roles… to see or assign PM, Deputy and Sub-PM (Owner, PM or Deputy).',
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
