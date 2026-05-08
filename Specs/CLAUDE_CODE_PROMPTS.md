# Claude Code Handoff — How to use these files

## What's in this folder

| File | Purpose | When to use |
|---|---|---|
| `CRP_Project_Tracker.jsx` | v29 reference implementation (10,454 lines) | Source of truth for behavior & visual reference |
| `FEATURES_SPEC_v21_to_v29.md` | Primary spec doc (57KB, ~1580 lines) | **Main file to give Claude Code** |
| `CLAUDE_CODE_PROMPTS.md` | This file — prompts & workflow tips | Read when starting a session |

**Note:** v15-v20 features (Activity Dashboard, Briefing Pack, Decision Decay, Workspace Owner, All-projects toggle, Portfolio View, Gantt View) were covered by a previous spec doc (`TODAYS_FEATURES_SPEC.md`) already shipped to Claude Code. This new spec covers everything from v21 onward.

---

## Setup before first session

```bash
# 1. Move the spec files into your repo
cp CRP_Project_Tracker.jsx /path/to/repo/src/CRP_Project_Tracker_v29_reference.jsx
cp FEATURES_SPEC_v21_to_v29.md /path/to/repo/specs/

# 2. Commit current state of your repo (where v15-v20 was already applied)
cd /path/to/repo
git status   # ensure v15-v20 features are stable
git add -A && git commit -m "Pre-v21 baseline"

# 3. Install Claude Code if not already
npm install -g @anthropic-ai/claude-code

# 4. Start session
claude
```

---

## Initial prompt (paste this first)

```
I need to apply a series of features from v21 to v29 to my CRP Project Tracker app.
Previous features (v15-v20) were already applied via TODAYS_FEATURES_SPEC.md.

Read these files in order:
1. specs/FEATURES_SPEC_v21_to_v29.md — the spec to apply (start at "Cross-cutting design principles")
2. src/CRP_Project_Tracker_v29_reference.jsx — the reference implementation showing the
   target end state. Use this when the spec is ambiguous or you need to see exact code.

Then look at my current src/App.jsx (or equivalent) to understand my baseline.

After reading, please:
1. Confirm you understand the 8 cross-cutting design principles
2. Tell me which features in the spec are already applied in my baseline (probably none
   from v21+, but verify)
3. Outline a step-by-step plan to apply v21 → v29 in order, with checkpoints

Do NOT start editing yet. Wait for my approval of the plan.
```

---

## Per-version prompts

### Applying v21 (Multi-PIC Combo 1)

```
Apply v21 (Multi-PIC Combo 1) per the spec.

Constraints:
- Don't break existing PIC functionality (single PIC must keep working)
- task.contributors defaults to []
- Soft validation only

After implementation:
1. Show me the new ContributorEditor component code
2. Show me the integration in TaskDetail
3. Run a parse check: npx @babel/parser src/App.jsx --plugins jsx --source-type module
4. List any tasks I should manually test
```

### Applying v22-v25 (Credit Allocation, all 4 phases)

```
Apply credit allocation system v22-v25 per the spec, ALL 4 phases together.

This is a large change spanning:
- Helper functions at top of file (computeProjectCredits etc.)
- WeightBadge component
- CreditSharesEditor component
- ProjectSettingsModal additions (credit allocation, project lead, lock workflow)
- OutlineView wire-up (banner, weight badges with cp values)
- TaskDetail wire-up (credit projection panel, credit shares editor)
- ActivityDashboardView additions (Credits column)
- New CreditReportView component + new tab

Approach:
1. First, show me your plan with implementation order (probably: helpers → schema →
   components in dependency order → integrations → new tab)
2. Implement v22 (Phase 1) only. Stop. Parse check. Show me a summary.
3. Wait for my "go" before v23.
4. Continue v23 → v24 → v25 with stops between each.

This is a 6-7 hour task in total. Don't try to do it all in one shot.
```

### Applying v26 (PicEditor + Contributor Registry)

```
Apply v26 per the spec.

Critical: PicEditor in v26 spec accepted both teamMembers and contributorRegistry as
suggestions. v29 reverts this — PIC must be teamMembers-only. So:
- For now, follow v29 behavior (teamMembers only) — see "PicEditor — revert" section in v29
- But still add the project & teamMembersList props for future-proofing

Order:
1. Add contributorRegistry schema field (optional)
2. Build PicEditor component
3. Update ContributorEditor to use registry + teamMembers
4. Add Contributor Registry section to ProjectSettingsModal (with cleanup tool)
5. Remove "Rename project" menu item

Parse check after each step.
```

### Applying v27 (Deadline approval workflow + Activity restriction)

```
Apply v27 per the spec.

Key components:
- DeadlineRequestDialog (new modal)
- DeadlineRequestBanner (visible to all, role-based actions)
- TaskDetail handlers: submit/approve/reject/cancel
- Gate End date input + Hard/Soft toggle (owner-only)
- Activity Dashboard sort/window controls (owner-only)

After implementation, walk me through the full workflow:
1. Non-owner submits request
2. Owner approves
3. Owner rejects (with note)
4. PIC cancels their own request

Verify each path produces the right audit log entries.
```

### Applying v28 + v29 (final polish)

```
Apply v28 and v29 per the spec, in order.

v28 highlights:
- DecisionForm decidedBy rework with valid/legacy split
- ContributorEditor + DecisionForm Clear-all buttons
- Action item PIC select with optgroups (later simplified in v29)

v29 highlights:
- DEFAULT_DEPARTMENTS constant
- Auto-seed contributorRegistry for new projects (createNewProject + parseExcelFile)
- "✨ Seed defaults" button in registry UI
- Empty registry hint
- Project Lead empty-state hint
- Clear-all visibility threshold (>= 1, not > 1)
- Excel import validation alert

Note: v29 reverts the "PIC includes contributorRegistry" change from v28. Apply v28
first (which adds it), then v29 reverts it. Don't skip v28.
```

### Final parse + smoke test

```
Now that v21-v29 are all applied:

1. Run full parse check
2. Run dev server: npm run dev
3. Walk through the test scenarios from the spec:
   - As workspace owner (8 steps)
   - As non-owner (4 steps)
   - As 3rd party (1 step)
   - Legacy data import (6 steps)
   - Cleanup tool (5 steps)

Let me know any failures.
```

---

## Useful Claude Code commands during session

```bash
# Inside Claude Code session:

# Read the spec
/read specs/FEATURES_SPEC_v21_to_v29.md

# Find a function in your source
/find computeProjectCredits

# Compare your impl vs reference
/diff src/App.jsx src/CRP_Project_Tracker_v29_reference.jsx 870 1000

# View part of reference
/view src/CRP_Project_Tracker_v29_reference.jsx 2000-2200

# Run parse check
!npx @babel/parser src/App.jsx --plugins jsx --source-type module

# Run dev server
!npm run dev

# Search for owner-only patterns
!grep -n "meta?.workspaceOwner" src/App.jsx

# Count occurrences of a pattern
!grep -c "isOwner" src/App.jsx
```

---

## Workflow tips

1. **Always have it read the spec first** — without it, Claude Code makes naive suggestions that violate invariants.

2. **Plan first, then execute** — for big changes (v22-v25 credit system), insist on a plan with checkpoints.

3. **Run parse check after every batch** — catches syntax errors before they compound.

4. **For UI changes, ask for visual descriptions** — "Show me what this looks like in 3 ASCII mockup states (default / editing / error)".

5. **Commit between versions** — `git commit -m "Applied v22"` so you can roll back any single version cleanly.

6. **Don't let it split the file prematurely** — single-file is intentional. File splitting is a separate dedicated session AFTER production is stable.

7. **Test with seed data first** — SEED_CRP at the top of the file is the canonical test dataset (188 tasks, 8 programs).

8. **Reference the v29 file when stuck** — the spec describes intent; the reference shows exact implementation. If the spec is ambiguous, the reference wins.

---

## Things to be careful of (recurring traps)

1. **Hooks must be before any return** — `if (!isOwner) return ...` after useState/useMemo, not before. CreditReportView demonstrates the correct pattern.

2. **`str_replace` on multi-line blocks fails if non-unique** — add 3-5 lines of unique surrounding context.

3. **`ContributorEditor` signature change** in v26 — has 3+ call sites. Update all when you change.

4. **`computeProjectCredits` runs every render** — keep it pure & fast.

5. **New schema fields must have defaults** — old data must still work.

6. **`SEED_CRP` is for new workspaces only** — if you change task schema, also update SEED_CRP defaults so first-time users get the correct shape.

7. **Modal state during cleanup tool merges** — when `performMerge` saves the project, include all modal state (creditPoints, members, etc.) in the payload, not just project changes.

8. **Don't migrate PIC names to emails** — user explicitly said they will re-assign manually via task edit. Don't build bulk migration unless asked.

---

## After all features applied — production readiness

Things you'll likely want Claude Code to help with next:

1. **Firebase wiring** — the persistence layer (`saveProject`, `saveMeta`, etc.) is currently abstract. Wire actual Firestore reads/writes.

2. **Email notifications** — task.pic and action item PIC have email registered. Wire SMTP or SendGrid for actual sends.

3. **Auth integration** — `author` and `meta.workspaceOwner` are currently strings. Wire to Firebase Auth or another provider.

4. **Multi-file refactor** — split into `src/components/`, `src/lib/`, etc. Suggested structure:
   ```
   src/
     ├── App.jsx
     ├── components/
     │   ├── views/         (OutlineView, GanttView, MindMapView, etc.)
     │   ├── editors/       (PicEditor, ContributorEditor, CreditSharesEditor)
     │   ├── modals/        (ProjectSettingsModal, BriefingDialog, etc.)
     │   └── ui/            (Btn, Modal, Input, Pill, etc.)
     ├── lib/
     │   ├── credit.js      (computeProjectCredits, helpers)
     │   ├── activity.js    (PIC scoring computation)
     │   ├── excel.js       (parseExcelFile, projectToExcelBlob)
     │   ├── format.js      (date utils, etc.)
     │   └── firebase.js    (saveProject, saveMeta, etc.)
     ├── constants/
     │   ├── tokens.js      (TOK, FONT_STACK)
     │   └── seed.js        (SEED_CRP)
     └── main.jsx
   ```

5. **Mobile responsiveness** — current modals are 460-560px and don't adapt to narrow viewports. Add responsive breakpoints.

These are all separate dedicated sessions, not part of the v21-v29 spec.
