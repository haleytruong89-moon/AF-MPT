# P4 — Role-based tab bar, landing view and header menu

- Status: approved by HOD 13/11/2026 (mockup https://claude.ai/artifact/VsM6unVGg9iazLn3u1ByWo, version 5)
- Source decisions: roles-permissions v2 spec §10 (14/10), `docs/DESIGN.md` §4, UX review 11/11 (A3, D5)
- Rules change: **none**. Data change: **none**. Pure client UI.

## 1. Intent

Today every person sees 13 tabs and ~10 header buttons, whatever their role. The department is about to be onboarded; an Assignee should open the app and see only what they work with. P4 changes **which tabs appear, in what order, where the app opens, and where the header buttons live**. It does **not** change what is inside any tab (My Work keeps By urgency / By project and all its sections exactly as today).

## 2. Role tier (UI only)

Computed once per render from the loaded projects; never used for authorization (rules stay the authority).

| Tier | Who |
|---|---|
| `owner` | `isOwner` (workspace Owner, `ownerUids`) |
| `manager` | not owner, and in at least one loaded **v2** project holds PM, Deputy or Sub-PM (`roles.programs[*].pmUid/deputyUid`, `roles.workstreams[*].leadUid`) |
| `member` | everyone else (Assignee, contributor, viewer) |

v1 projects carry no roles, so a PM of a still-v1 project (MA, UBO, CRP today) is `member` until that project moves to v2. Accepted: those people only lose the Briefing entry until migration.

## 3. Tab bar

Groups separated by a thin divider. `Plan` is one tab that is active when `view` is `mindmap`, `outline` or `gantt`.

| Tier | Tabs (in order) |
|---|---|
| owner | Plan · My Work │ Actions · Decisions · RAID │ Portfolio · Dashboard · Team │ Briefing · Credits · Activity |
| manager | Plan · My Work │ Actions · Decisions · RAID │ Dashboard │ Briefing |
| member | My Work · Plan │ Actions · Decisions · RAID │ Dashboard |

- **Briefing** is a tab-bar entry that opens the existing Briefing dialog (no new view).
- **Aggregation** is removed from the tab bar and from the all-projects empty state ("Open Aggregation" button). The component stays in the file, unused.
- Existing badges stay: My Work count, RAID pending count, Decisions/Actions counts.
- Impersonation (View as) keeps today's behaviour: only My Work.
- **Approvals stays inside My Work** ("Needs my approval" / "Sent for approval"). No separate Approvals tab in P4 (HOD 13/11 accepted the recommendation; P3.2 still deferred).

### Plan view switch

When Plan is active, a segmented control `Mind map | Outline | Gantt` sits at the top of the content area, above the view. The last chosen sub-view is remembered per browser (`uiPrefs`, try/catch, default `outline`). Clicking the Plan tab returns to that sub-view.

## 4. Landing view

Resolution order when the app opens:

1. Personal override (`userPreferences[author].defaultViewOverride`) if it is a view the tier can see.
2. By tier: owner → `portfolio`; manager → last Plan sub-view, with `scopeProgramId` set to the manager's first program (PM/Deputy program, else the program containing their Sub-PM workstream) in the current project if any; member → `my-work`.

`meta.defaultView` (workspace default) is no longer used for landing; the Owner's "workspace default" control is removed from the menu. A stored override of `aggregation` or of a tab the tier cannot see falls through to step 2.

Sub-PM: there is no workstream-level filter today; Sub-PM lands on the program that contains their workstream (my call — adding a WS filter is new scope; the FOCUS chip shows the filter and can be cleared).

## 5. Header

Kept in the header: app name, project selector, role chip, FOCUS selector, progress, Search, save chip, ?, account menu.

All other buttons move into one **⋯** button (label `⋯ Export / Import` for owner, `⋯ Export` otherwise). The old project ⋯ menu merges into it. Menu content by tier:

| Section | Items | Who |
|---|---|---|
| Export | Meeting mode, Minutes, Export Excel, Backup JSON | all tiers (same as today's buttons) |
| Import | New project, Import Excel, Restore from JSON | owner only |
| People | Members & related parties, Roles…, People directory | Members/Roles: all (modals already enforce rights); Directory: owner |
| Project | Project settings…, Delete project | settings: all (modal enforces); delete: owner |

Labels in English (app UI is EN). `data-tour="project-menu"` moves to the new ⋯ button; the walkthrough step "view-tabs" text changes to describe the Plan switch.

## 6. Non-goals

- No change to any tab's content, to rules, to data, to Approvals logic.
- No Approvals tab, no WS-level filter, no workspace switcher.
- No App.jsx restructuring beyond the tab bar, header and landing effect.

## 7. Acceptance

- Assignee account (no v2 manager role): sees 6 tabs, opens on My Work, no Import/Restore/New project anywhere.
- PM of a v2 program: opens on Plan filtered to their program; sees 8 tab entries; ⋯ shows Export + People + Project only.
- Owner: opens on Portfolio; Aggregation gone; ⋯ shows all sections.
- Plan switch changes Mind map/Outline/Gantt and is remembered after reload.
- Lint gate (2 errors / 32 warnings) and all tests stay green.

## 8. Delivery

Two PRs, each opened against `main` after the previous one merges:

1. **P4-A** tab bar + Plan switch + landing view (pure helper `src/tabsByRole.js` with unit tests).
2. **P4-B** header ⋯ menu + walkthrough copy.

Rollback: Vercel Promote previous deployment, then `git revert -m 1 <merge>`. No data or rules to undo.
