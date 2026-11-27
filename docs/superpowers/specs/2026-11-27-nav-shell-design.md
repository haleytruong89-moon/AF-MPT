# Navigation shell and SmartOSC theme: design (27/11/2026)

HOD decision 27/11: option B of the layout mockups (https://claude.ai/artifact/GH548rDT9gzT5AX4ZUT5f6), with the SmartOSC BMS look. Plan: `docs/superpowers/plans/2026-11-27-nav-shell.md`.

## Why

The top bar holds everything on one wrapping row (`src/App.jsx:14899-15040`). With a project open it also carries the project selector, role chip, Scope and progress, so the 11 tabs wrap to a second line; on cross-project pages they do not. The layout jumps on every switch, and 11 flat tabs mix three different things: my own work, one project, management reports. The whole department is about to be onboarded; they should learn one stable layout.

## Goals

1. The navigation never moves: a fixed left sidebar, the same on every page.
2. Three groups that match how people think: **mine** (My Work, Weekly briefing), **projects** (All projects, each active project, closed projects), **management** (Portfolio, Team, Credits, Coaching; Owner only).
3. Inside a project: a project header (name, role, progress, Scope) and 5 tabs (Plan, Actions, Decisions, RAID, Dashboard).
4. SmartOSC BMS look: Inter, JetBrains Mono for numbers, brand blue `#295CA9`, cool slate neutrals, navy sidebar `#0F1B33`, borders over shadows; text contrast ≥ 4.5:1.
5. Icons instead of emoji in the app chrome.

## Non-goals

- No change to data, Firestore rules, permissions, or what each role may see or do (`tabsFor(tier)` stays the source of which views a tier has).
- No change inside the views (My Work, Outline, Credits…) beyond colours and fonts that come from the tokens.
- No new features (no notifications centre, no favourites, no drag to reorder projects).
- No mass refactor of `App.jsx`: only the shell block is replaced; everything else is edited through tokens.
- Emoji inside generated text (Briefing / Minutes Markdown, Google Chat cards, Activity descriptions) stay.

## Behaviour

**Sidebar (240 px, navy):**
- Brand "AF Project Tracker".
- *Mine*: **My Work** with the red count that the tab has today; **Weekly briefing** (opens the dialog) for tiers that have Briefing, and for members too (today it is in the ⋯ menu).
- *Projects*: **All projects** (the current `__all__` mode), then each active project with a health dot and its % complete; **Closed projects (n)** expands to list them. The current project is highlighted while a project view is open.
- *Management* (only the views `tabsFor(tier)` gives that tier): Portfolio, Team, Credits, Coaching.
- Bottom: the account button (opens the existing account menu).
- View as: only My Work is shown (as today).
- Narrow window (< 960 px) or the collapse button: the sidebar is hidden and a menu button in the top bar opens it as a drawer; the choice is remembered per browser.

**Health dot of a project** (open = Planned / In Progress; computed, not stored): grey = no open task; red = an open task with health red, or ≥ 20% of open tasks overdue; amber = any overdue open task or any open task with health amber; green otherwise. The dot has a text title ("At risk: 3 overdue"), so colour is never the only signal.

**Clicking a project** opens it on the Plan view the person used last when the current page is not a project view (My Work, Portfolio…); otherwise it keeps the current tab. **Clicking My Work / a management page** leaves the current project selected (as today).

**Top bar (56 px, white), always one row:** menu button (when the sidebar is hidden) · page title, or for a project view: project name, role chip, `19% · 8/42 complete · 20 overdue` · spacer · save chip · Scope (project views where it applies) · Search · Help · ⋯ More.

**Project tabs (second row, project views only):** Plan, Actions (count), Decisions (count), RAID (pending badge), Dashboard. On All projects the same tabs show (aggregated views exist today).

**Walkthrough:** the anchors `tab-my-work`, `view-tabs`, `role-chip`, `project-menu`, `search`, `help` keep their ids; the copy of two steps is updated ("sidebar" instead of "tabs").

**Theme:** one token module (`src/theme.js`) replaces the five copies (`App.jsx`, `DirectoryModal`, `MembersModal`, `SearchModal`, `GanttView`). Values in the plan; a unit test checks every text / background pair at 4.5:1.

## Delivery

Three PRs against `main`, each revertable alone, none touching data or rules:
1. **Shell**: tokens extracted unchanged, navigation model, sidebar, top bar, project tabs, walkthrough copy.
2. **Theme**: token values, fonts, hard-coded colours mapped to tokens, mono numbers in the shell and the Credits / Effort tables.
3. **Icons**: emoji in the app chrome replaced by Lucide icons.

Rollback for each: Vercel Promote the previous deployment, `git revert -m 1 <merge>`.

## Left to the builder

Exact paddings and icon choices; how the Closed projects list animates (it may simply toggle).
