# Replace person (role assignment PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** The Owner moves one person's roles and open work in one v2 project to another person, after a preview, in one run that can be repeated safely.

**Spec:** `docs/superpowers/specs/2026-11-05-role-assignment-design.md` §8 (and §7.3 for pending requests, §13 calls 4–5).

**Architecture:** a pure planner (`src/replacePerson.js`) lists what moves and what stays, and rewrites the tree (PIC / contributors / credit share keys). The App runs it in the project's close chain: flush pending saves → each role through the existing `changeRoleNow` (role write + reroute + `role_changed`) → make sure the new person is a project member (`addMemberV2`) → tree edit through the normal save path → close requests still pointing at the old person are reassigned (`reassignClose`, as the role reroute does) → optional "Also remove from project members" (`removeMemberV2`) → one `person_replaced` activity event. Each step only touches items still on the old person, so a second run picks up what failed.

## Global Constraints

- No rules change, no script, no migration: every write goes through paths the rules already accept for the Owner (role change transaction, member patch like `executeRoleChange`, v2 tree save, reassign).
- Owner only, v2 projects only, not in View as.
- Not moved (listed in the preview): Completed / Dropped tasks (credit history), Submitted tasks where the person is PIC or contributor (frozen until decided), RAID / decision authorship, activity, action steps.
- UI copy in English.

## Tasks

1. `src/replacePerson.js` + `tests/unit/replacePerson.test.js`
   - `planReplace({ project, roles, fromUid, isFrom, toUid })` → `{ roles: [{ kind, programId, wsId?, scopeName }], tasks: [{ id, name, pic, contributor }], actions: [{ id, title }], approvals: [{ id, name }], kept: { closed, submitted: [{ id, name }] }, blocked: [{ kind, scopeName, reason }] }`. A role whose move `validateRoleChange` refuses (PM = Deputy) goes to `blocked`.
   - `applyReplace(project, plan, { isFrom, toName })` → new tree: PIC → `toName`, contributors renamed (deduped, never equal to the PIC), credit share keys renamed (merged when the new person already has a share).
   - Tests: each role kind; open vs closed vs Submitted tasks; uid match and name match; actions open / done; approvals; PM=Deputy blocked; contributor that becomes PIC; share merge; second plan after apply is empty.
2. `src/storage-shim.ts`: `addMemberV2(pid, uid)`, `removeMemberV2(pid, uid)` (same patch shape as `executeRoleChange` / `removeProjectMember`, in the project write queue, cache updated).
3. `src/App.jsx`: `ReplacePersonModal` (from → to pickers, preview lists, "Also remove {from} from project members", Apply); entry "Replace person…" in the Roles modal for the Owner; `replacePersonNow` as above; `changeRoleNow` gets `quiet` (no toast, returns result).
4. Docs: CLAUDE.md status + Rollback row; PR with the check list from spec §10 item 9.
