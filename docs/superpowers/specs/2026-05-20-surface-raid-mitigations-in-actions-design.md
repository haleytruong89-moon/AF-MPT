# Surface RAID mitigation actions in Actions view + My Work

## Context

Today, RAID mitigation actions live in `project.programs[].raid[].mitigationActions[]` — a separate namespace from `project.actionItems[]`. The Actions view (`view === 'actions'`) and My Work's "Action items" section both render only `actionItems`, so mitigation actions only appear inside the RAID tab and the `MyRaidSection` block in My Work.

Result: users open Actions / My Work to see "everything I need to do today" — and miss the mitigations buried inside RAID. They forget them.

## Goal

Surface RAID mitigation actions assigned to the viewer alongside their regular action items, in every "Actions"-shaped list, while keeping the underlying data structure unchanged.

## Non-goals

- **No schema migration.** `mitigationActions` stays inside RAID items. We do a virtual merge at render time.
- **No change to RAID detail UI.** Mitigations still appear inside RAID items as today — this only ADDS visibility in Actions / My Work, doesn't move them.
- Cross-project mitigations are out of scope for this pass; same-project rules apply.

## User stories

1. **As a PIC**, when I open the **Actions tab** of a project, I see every action assigned to me — both regular action items AND RAID mitigation actions — in one list, with a clear visual marker telling me which is which.
2. **As a PIC**, when I open **My Work**, the "Action items assigned to me" section includes my open RAID mitigations alongside regular actions, bucketed by today/week/later using the mitigation's `due` date.
3. **As a PIC** clicking a mitigation row, I can expand it inline and edit title/PIC/due/status without leaving Actions / My Work. A `→ Open RAID item` link in the expanded footer jumps me to the RAID view focused on the parent risk if I need full context.

## Sources of truth

- `project.programs[].raid[].mitigationActions[]` shape: `{ id, title, pic, due, status, ... }`
- `mitigation.status === 'Done'` is the completion marker (same convention as actionItems).
- The mutation already in use to update a mitigation is `MitigationActionRow.onUpdate({ ...patch })` → caller writes back to `item.mitigationActions[i]` → `updateProject(...)`. We reuse the same write path, just trigger it from new surfaces.

## Where mitigations now surface

Three places gain a merged list. RAID detail / RAID tab unchanged.

| Surface | Before | After |
|---|---|---|
| Actions view (`view === 'actions'` in `ActionItemsView`) | `project.actionItems[]` only | `project.actionItems[]` + `getProjectMitigations(project)` (current project only) |
| My Work — "Action items assigned to me" tabs (urgency view) | `myWork.actionItems.{today,week,later}` | Same buckets, plus mitigation entries where `mitigation.pic === author`, bucketed by `mitigation.due` |
| My Work — By Project card "Actions" block | per-project actions sourced from `myWork.actionItems` | Same bundle; mitigations included since they're added to `myWork.actionItems` |

`computeMyWork` is the single point of change for the My Work side; only one helper is needed for Actions view (which doesn't go through `computeMyWork`).

## Visual marker

Mitigation rows render with the same row component as regular actions, plus:

- **Badge**: `🛡 RAID` chip in the same row position where regular actions show their meeting ref. Color: red-tinted (`TOK.overdueBg` background, `TOK.overdueFg` foreground) to signal risk context — but not so red that it screams "broken".
- **Breadcrumb**: where regular actions show `Meeting: {meetingRef}`, mitigations show `RAID: {parentRaidItem.title}` (truncate to 60 chars). Click on the breadcrumb itself does nothing (footer link handles navigation); it's labeling only.
- **Priority pill**: derive from parent RAID item's risk level. Critical → `High`, High → `High`, Medium → `Medium`, Low → `Low`. If no level, no pill.

## Inline expand — same shape as ActionRowInline

Click row → expand. Expanded body:
1. Inline-editable title (text input, blur to save).
2. PIC select — fed by the same `picSuggestions` the actions view already uses.
3. Due date input.
4. Status pill (Open / In Progress / Blocked / Done — same set the existing `MitigationActionRow` uses).
5. Comments thread — read-only for v1 (mitigation comments schema would be a separate enhancement). Just show "💬 Comments live in the RAID detail" placeholder with the open-RAID link.
6. Footer:
   - `[✓ Mark done]` button (when not already Done)
   - `[→ Open RAID item]` button — navigates to RAID view scoped to the parent program, with the parent RAID item focused/expanded.

Use the existing `setView('raid')` + `setRaidScopeProgramId(programId)` pattern already wired for `onNavigateRaid`. Extend it with an optional `initialRaidItemId` so the RAID view can scroll-focus that item on mount. (If the RAID view doesn't yet support focusing a specific item, fall back to scoping the program — adding the focus is a follow-up.)

## Helper — `getProjectMitigations(project, opts)`

New pure helper next to `computeMyWork`. Returns a flat array of enriched entries:

```js
{
  kind: 'mitigation',
  mitigation,                // the action object
  parentItem,                // the RAID item
  parentProgram,             // for navigation
  project,                   // for navigation
}
```

Signature:

```js
getProjectMitigations(project, { picOnly = null, openOnly = true } = {})
```

- `picOnly`: when set, filter `mitigation.pic === picOnly`
- `openOnly`: when true (default), filter `mitigation.status !== 'Done'`

Used by:
- Actions view → `getProjectMitigations(project, { openOnly: true })` (all open mitigations in project, not just current user's)
- `computeMyWork` → `getProjectMitigations(proj, { picOnly: author, openOnly: true })` per project, then bucket by `mitigation.due` into today/week/later using existing bucket logic

## Data flow — write path

Mark-done from a mitigation row:
1. Row component receives the row's `{ mitigation, parentItem, parentProgram, project }`.
2. Calls `onMitigationUpdate({ ...mitigation, status: 'Done' }, { project, parentProgram, parentItem })`.
3. Caller threads to existing `updateProject` after patching `programs[].raid[].mitigationActions[i]`.

Existing pattern: `MitigationActionRow.onUpdate(diff)` already does this inside RaidView. We extract that mutation logic into a thin helper `applyMitigationUpdate(project, parentItem, mitigation, diff)` and reuse from the new surfaces.

## What changes (code)

- **New helper `getProjectMitigations`** in App.jsx near `computeMyWork`.
- **New helper `applyMitigationUpdate`** in App.jsx that produces a new project object with the mitigation patched.
- **`computeMyWork` extension**: after the existing actionItems loop, iterate `project.programs[].raid[].mitigationActions[]` for `mitigation.pic === author`, bucket by `mitigation.due` into `today/week/later` with `kind: 'mitigation'` enriched entries.
- **`ActionItemsView`** (Actions tab): merge `project.actionItems[]` with `getProjectMitigations(project)` for rendering. Each mitigation row uses a new component or extended row.
- **`ActionRowInline`** (used in My Work): branch on `entry.kind === 'mitigation'` to render the mitigation variant — same shape, different data plumbing + the breadcrumb / link.
- **My Work urgency view "Action items"** + **By Project card Action block**: no code change — they read from `myWork.actionItems` which now includes mitigations automatically.

## Acceptance criteria

- [ ] In a project with 2 actionItems and 3 mitigationActions (all assigned to me, all open), the Actions tab lists 5 rows in a single feed.
- [ ] Mitigation rows show `🛡 RAID` badge + `RAID: {risk title}` breadcrumb.
- [ ] Mitigation rows have a derived priority pill matching the parent risk level (or no pill if no level).
- [ ] Clicking a mitigation row expands it inline. The expand form lets me edit title / PIC / due / status. Saving any field writes back to the mitigation inside the parent RAID item (verify by switching to RAID view).
- [ ] The expanded footer has `[✓ Mark done]` (when not Done) and `[→ Open RAID item]`.
- [ ] Clicking `→ Open RAID item` navigates to RAID view, scoped to the right program. (Item-level focus is acceptable follow-up if not trivially supported.)
- [ ] My Work → "Action items assigned to me" today/week/later tabs include mitigation rows in the correct bucket based on `mitigation.due`.
- [ ] Mitigations also appear in the By Project view's per-project Action block (no extra code — they ride on `myWork.actionItems`).
- [ ] Marking a mitigation Done from any of the new surfaces ALSO marks it Done in the RAID detail view (single source of truth, no duplication).
- [ ] Marking a mitigation Done removes it from the "open" bucket in all surfaces.
- [ ] `MyRaidSection` in My Work still shows the same mitigations (no regression — RAID-context visibility is preserved).

## Out of scope

- Mitigation comments threading (parity with `actionItem.updates[]`). Footer placeholder links back to RAID detail for now.
- Cross-project mitigation aggregation in the Actions tab (Actions tab is single-project).
- Subtasks on mitigations.
- Bulk "convert mitigation → standalone actionItem" tool.
