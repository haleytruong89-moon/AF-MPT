# Credit and effort by year (design)

- Source: `docs/reviews/2026-11-25-credit-year-cutoff.md` (risks Y1–Y9, options, HOD decisions §6); production check 25/11 (read-only): 40 closed tasks (CRP 26, MA 11, UBO 3), **none** has `approvedAt`; all 40 have a matching status line in Activity; every live project has `creditYear = 2026`, pool 100, weights unlocked.
- HOD decided 25/11: credit counted in the **year the task was closed**; **year-end snapshot**; effort = credit points with closed-task count beside; multi-year projects keep **one lifetime pool** sized for their length; annual projects are emptied (closed / dropped) and **Closed** at year end, next year created from a copy of the structure.

## Intent

Yearly reports of performance and credit must be correct for annual and multi-year projects, must not change after the year is closed, and must show effort by person and by project, per year and over a project's life.

## Definitions (one module, unit-tested, used by every screen)

| Term | Rule |
|---|---|
| Closed on | `task.approvedAt` (set by a direct close and by an approval). For tasks closed before P3.1: filled once by the G1 script |
| Year of a closed task | Calendar year of `approvedAt` in **Asia/Ho_Chi_Minh** (UTC+7, no DST) |
| Earned in year Y | cp of tasks **Completed** with year Y (Dropped earn nothing) |
| Remaining | cp of tasks still open (Planned / In Progress / Submitted); belongs to the current year |
| Lifetime | sum of all years + remaining |
| Project lead | lead pool × (number of tasks Completed in year Y ÷ number of non-dropped tasks), per year; remaining = the rest |
| On time / late | closed on (VN date) ≤ planned end |
| Unknown | closed task with no `approvedAt` after G1 (should be none); listed, never counted as on time or late |

`project.creditYear` no longer decides the year of credit; it stays as the year shown with the pool and the weight lock.

## G1 — closed date for old tasks

**HOD 25/11: not run (option B).** A Completed / Dropped task with no `approvedAt` counts in its **project's `creditYear`** (all 40 such tasks were closed in 2026, every live project is 2026) and is **not rated** on time / late; it shows "Date unknown" and appears in year views, not month / quarter views. The script below was merged (#68) and stays available but is not run.

### Script (kept, not run)

`scripts/p2-backfill-closed-at.mjs`, same pattern as `p2-backfill-uids` (one project per run; preview → plan hash → `--apply --expect <hash>`; manifest before the transaction; `STATE_CHANGED` refusal; `--rollback <manifest>`).

- For each Completed / Dropped task with no `approvedAt`: find the newest Activity event of that project whose description names the task (`"<name>"`) and ends in `→ Completed` / `→ Dropped` matching the task's status; date = the event's `createdAt` (else `timestamp`). Source `activity`.
- No event, or the task name is not unique in the project: fall back to the task's `end` (end of that day, VN). Source `end-date`. No `end` either: listed as unknown, not written.
- Writes `approvedAt` (ISO) and `approvedAtSource` (`'activity'` | `'end-date'`), `version + 1`, `updatedBy: 'p2-backfill-closed-at'`. Never touches a task that already has `approvedAt`. `closedByUid` / `approvedByUid` stay empty (unknown).
- Preview lists every task: project, task, status, date found, source; summary per source.
- Tests: planner (activity match, newest event wins, wrong status ignored, duplicate names → end-date, no end → unknown, already dated → untouched, hash stable); emulator apply / `PLAN_CHANGED` / `STATE_CHANGED` / rollback.

## G2 — credit by year

- New pure module `src/creditYears.js`: `vnYear(iso)`, `closeYear(task)`, `creditByYear(project, breakdown, { year | 'lifetime', now })` → per person: earned, remaining, tasks closed, on time, late; per task rows.
- Credits tab (Owner), My record (member), Dashboard "By person" (closed counts): all use it. Year select lists the years that have closed tasks, plus the current year, plus **Lifetime**.
- The Credits tab stops filtering by `project.creditYear` (fixes Y1, Y2, Y6).
- Project settings, pool field: note "Multi-year project: size the pool for its whole life."
- Tests: a project spanning 2026–2027 with hand-computed cp per year; lead share per year; Dropped; VN year boundary (2026-12-31T17:30Z = 2027 in VN).

## G4 — project Closed

- Project doc fields (Owner only; v2 project docs are already Owner-only in the rules): `lifecycle: 'active' | 'closed'`, `closedAt`, `closedBy`.
- Project settings (Owner): **Close project** — refused while any task is Planned / In Progress / Submitted (lists them: "Close or drop these tasks first"); **Reopen project**. Both logged in Activity.
- A closed project: shown under "Closed projects" at the end of the project selector; left out of My Work, Portfolio cards and the All-projects Gantt; banner "This project is closed (date)" on its tabs; **always included in reports** (Credits, Effort, My record).
- Delete stays for mistakes only; the confirm adds "To finish a project, use Close project instead (its credit stays in reports)."
- **Copy structure from last year** (Owner, ⋯ More → New project…): choose a project; copies programs, work streams, PM / Deputy / Sub-PM, weights; no tasks, no actions, no dates; new name prefilled with the year + 1.

## G5 — Effort report (Owner, Credits tab)

- Period: a year, or Lifetime. Measure: cp earned (main) and tasks closed (beside); remaining cp shown for the current year and Lifetime.
- **By person**: one row per person, columns = projects, cell = cp (tasks); row total. Click a cell → task list (task, closed on, on time / late, cp).
- **By project**: one row per project, columns = people; same cells; row total.
- Copy as table on both.

## G3 — year-end snapshot

- Owner: Credits tab → **Close credit year {Y}**. Pre-check lists: tasks Submitted, closed tasks with no date, projects with weights unlocked; the Owner may proceed anyway (it is listed in the snapshot).
- Writes `workspaces/main/creditYears/{Y}` (`closedAt`, `closedBy`, `timezone`, `log[]`) and one doc per person `creditYears/{Y}/people/{personKey}` (uid when known) with totals and task rows; one doc per project `creditYears/{Y}/projects/{pid}`. Batched, ≤ 500 writes per batch.
- Once closed, every report for year Y reads the snapshot; Lifetime = closed years from snapshots + open years live.
- **Reopen year** (Owner, reason required, logged); closing again overwrites the snapshot.
- Rules: Owner reads and writes all; a person reads only `people/{their uid}`; nobody else. Emulator tests: Owner write / read; person reads own, not others; PM denied; write by non-Owner denied.

## Order

G1 script → HOD runs it (preview, approve, apply) → G2 → G4 → G5 → G3 before 31/12/2026 → Copy structure. Each in its own PR against `main`; G1 and G3 carry data / rules changes and say so with rollback.

## Left to the builder

Exact layout of the Effort tables and the Close-year screen; helper names; how many rows show before "Show all".
