# Nav shell: click-through (10 minutes, Owner + one Member)

Run on the Vercel preview of the PR (link in the PR checks), then again on production after merge. Hard-refresh first (Ctrl+Shift+R). Wrong line: screenshot + line number.

| # | Do | Expect |
|---|---|---|
| 1 | Click My Work, then a project, then Portfolio, then the project again | The sidebar never moves; nothing jumps to another line |
| 2 | Open a project | Top bar: project name, "Your role", % complete, overdue; second row: Plan, Actions, Decisions, RAID, Dashboard |
| 3 | From My Work click a project | Opens on Plan (the sub-view you used last) |
| 4 | On Actions, click another project | Stays on Actions, for the new project |
| 5 | Sidebar → All projects → Plan → Gantt | Gantt of every project |
| 6 | Change Scope on Outline, go to My Work, come back | Scope is remembered |
| 7 | ⋯ More → Hide sidebar; then the menu button at the top left | Sidebar hides; the button brings it back; the choice survives a reload |
| 8 | Narrow the window under 960 px | Sidebar becomes a drawer opened by the menu button |
| 9 | Account button (sidebar bottom) | Account menu opens above it; Sign out works |
| 10 | Team → View as a member | Sidebar shows only My Work; exit returns to Team |
| 11 | ? → Walkthrough | Every step points at something on screen |
| 12 | Member account | No MANAGEMENT section; Weekly briefing opens |
| 13 | A project you closed (if any) | Under "Closed projects (n)"; opens with the closed banner |
