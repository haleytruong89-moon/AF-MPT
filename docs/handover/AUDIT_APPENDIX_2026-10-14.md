# AUDIT APPENDIX — AF-MPT, 14/10/2026

This file goes with `HANDOVER_AFMPT_2026-10-14.md`. It holds the two detailed reports written during the 14/10/2026 session:
- **Part A:** feature inventory, with each feature checked against the spec and the code.
- **Part B:** technical audit covering architecture, data, security and technical debt.

**How citations work.** A bare line number means `src/App.jsx:<line>`. Any other file is named in full. Line numbers are correct as of commit `8971f1a`.

---

# PART A — Feature inventory

**Status labels:**
- **IMPL:** built and found in the code.
- **PARTIAL:** only partly built.
- **SPEC ONLY:** written in a spec but not found in the code.

## A1. Version history

| Version / phase | Date | Source doc | What shipped |
|---|---|---|---|
| v1 | before 2026-04-29 | README ("Migrating from v1 to v2") | Single-workspace artifact with no roles |
| v2: security model | 2026-04-29, "Initial commit" | README | Firebase, `@smartosc.com` domain gate, per-project roles, related parties, soft delete, server-checked activity author, security headers |
| v2–v14 | unknown | no docs found | Mind map, outline, dashboard, decisions, actions, aggregation, meeting mode, minutes, Excel import/export and check-ins already exist in the earliest specs |
| Walkthrough | spec 2026-04-29, built 2026-05-01 | `docs/superpowers/specs/2026-04-29-walkthrough-design.md` | Onboarding tour |
| Wiki References + Sign Out | 2026-05-05 | `Specs/FEATURES_SPEC.md` | Per-task links; sign-out and signed-out landing page |
| v15–v20 | 2026-05-08 | `TODAYS_FEATURES_SPEC.md` | Activity Dashboard phases 1+2, Briefing pack, Decision decay, Monday banner, Workspace Owner, All-projects toggle, Portfolio, Gantt |
| v21–v29 | 2026-05-08 | `Specs/FEATURES_SPEC_v21_to_v29.md` | v21 multi-PIC; v22–v25 credit system; v26 PicEditor and contributor registry; v27 deadline approval; v28 decision form polish; v29 default departments and import validation |
| v30 Phase 1–2: My Work | 2026-05-12/13 | `Specs/FEATURES_SPEC_v30_my_work.md` | My Work tab, `computeMyWork`, inline edits across projects |
| v30.A, A.1, A.2: Action desk | 2026-05-13 | `docs/superpowers/specs/2026-05-13-action-desk-*.md` | Actions in section 2; inline action edits; comments; create from My Work; hide Done tasks; inline decision status |
| v30.B: action sub-tasks | 2026-05-13 | `2026-05-13-action-subtasks-phase-b.md` | Steps with several PICs inside one action |
| v30 Phase 3: Team Overview | 2026-05-14 | `2026-05-13-team-overview-phase-3.md` | Team tab and "View as" |
| v30 Phase 4: Engagement | 2026-05-14 | `2026-05-14-engagement-phase-4.md` | Default landing view, personal override, My Work badge |
| v30 RAID phases 1–4 | 2026-05-14 | `Specs/FEATURES_SPEC_v30_raid.md`; prototype `src/CRPRaid.jsx` | RAID register |
| v30.M: My Work two views | 2026-05-19 | `Specs/FEATURES_SPEC_v30_mywork_views.md`; prototype `src/MyWorkViews.jsx` (untracked) | "By urgency" / "By project" toggle |
| Tasks sorted by start date | 2026-05-19 | `docs/superpowers/plans/2026-05-19-task-sort-by-start-date.md` (untracked) | Mind map, outline and Gantt |
| Google Chat Stage 1 | 2026-05-19/20 | `2026-05-19-google-chat-notify-stage1-design.md` | Webhook, opt-in notify on action comments, deep link |
| Mind map: add Program | 2026-05-20 | (commits) | Toolbar, right-click on the root, ⋯ menu on the root |
| RAID mitigations shown in Actions and My Work | 2026-05-27 | `2026-05-20-surface-raid-mitigations-in-actions-design.md` | |
| Chat notify when an action is created; card redesign | 2026-05-27 | `2026-05-27-notify-chat-on-new-action-design.md`, `2026-05-27-chat-card-focus-redesign-design.md` | Stage 2 "real ping" deferred |
| Members 1.1: plug identity leaks | 2026-06-04 | `2026-05-27-members-1.1-plug-leaks-design.md` | NameDialog removed; merge tool extended |
| Members 1.2: strict PIC inputs | 2026-06-07 | `2026-06-05-members-1.2-strict-pic-inputs-design.md` | Email resolves to name; PicPicker brought in line with PicEditor |
| Members 1.3: audit panel and UX | 2026-06-08 (last commit) | `2026-06-05-members-1.3-audit-panel-and-ux-design.md` | |

## A2. Features by module

### Auth, identity, security
| Feature | Status / evidence |
|---|---|
| Google sign-in, `@smartosc.com` only (client check plus rule) | IMPL: `src/auth.tsx:31`, `firestore.rules:29-32` |
| User directory (saved on sign-in; live directory listener) | IMPL: `src/auth.tsx:47`, `src/data.ts:61,76` |
| Name and email taken from Firebase profile (welcome dialog removed) | IMPL: 12430-12442 |
| Sign out (confirm, clear local identity, logOut) | IMPL: 12626-12638, 13726 |
| Security headers | IMPL: `vercel.json` |
| Privacy and terms pages | IMPL: `public/privacy.html`, `public/terms.html` |
| Admin scripts (claim ownership; JSON import) | IMPL: `scripts/setup-rbac.js`, `scripts/migrate.js` |
| Server-checked activity author | IMPL: `src/storage-shim.ts`; `firestore.rules:109-128` |

### Permissions and roles
| Feature | Status / evidence |
|---|---|
| Per-project roles owner/operator/member, enforced in rules | IMPL server-side: `firestore.rules:39-102`. README says "Viewer"; code says `'member'` |
| Role-based gating in the UI | **PARTIAL**: App.jsx never uses `canEdit`/`roleOf`. Only Firestore enforces roles, and failed writes only log a console warning |
| Members modal (Members tab and Related parties tab) | IMPL: `MembersModal.tsx:57,158,445`; toolbar 13279 |
| Workspace Owner: claim / transfer / release, plus `ownershipLog` | IMPL: 13031-13056, `TransferOwnerDialog` 12272, menu 13653-13689 |
| Owner check (verified email, or display-name match) | IMPL: 12449-12453. Weak point |
| Owner-only tabs: Portfolio, Credits, Team | IMPL: 13319-13321, guarded at 13493-13521 |
| Activity Dashboard controls locked for non-owners | IMPL: 7634-7640 |
| "Claim ownership (legacy project)" menu item | **SPEC ONLY / removed** |
| Soft delete of projects (`deletedAt`) | IMPL: `storage-shim.ts:106-107`, reads filtered at 146/183 |

### Workspace and projects
| Feature | Status / evidence |
|---|---|
| Multiple projects, switcher, create, delete | IMPL: 13266-13276, 13069, 13198 |
| CRP seed data | IMPL: 20, 12370-12378 |
| All-projects mode | IMPL: 13268, 13471-13530 |
| Program FOCUS selector | IMPL: 13284-13293 |
| Project Settings modal (name, OP code, team, credit, registry, Chat webhook) | IMPL: 13771-14763 |
| Rename project from the menu | Removed on purpose in v26; `renameCurrentProject` 13058 is dead code |
| JSON backup and restore | IMPL: 13174-13197 |
| Real-time sync between teammates | **PARTIAL / regressed**: data loads once via `window.storage`. The onSnapshot hooks in `data.ts:150,191,315` are never imported by App.jsx. Last write wins (400 ms debounce, 12592-12596) |
| `project.color` | **PARTIAL**: read with a default (10549); no UI to set it |

### Tasks
| Feature | Status / evidence |
|---|---|
| TaskDetail side panel | IMPL: 3089 |
| Status Planned / InProgress / Completed / Dropped, with % roll-up | IMPL: 23-26, `rollup` 1155 |
| Manual RAG health and note | IMPL: ~3379-3410 |
| Start/end, duration, deliverables, dependencies (free text) | IMPL: ~3452-3505 |
| Hard/soft deadline | IMPL: 31-33; owner only |
| Updates feed (@mentions, blocker, resolve; legacy check-ins) | IMPL: 2051, 2150, 2181, 2242 |
| Linked decisions and actions tabs | IMPL: ~3622-3720 |
| Wiki References (type detection, Excel round-trip) | IMPL: 135-175, 2373, 1563, 1590 |
| Contributors (multi-PIC) | IMPL: `ContributorEditor` 2459 |
| Primary PIC picker (team members only) | IMPL: `PicEditor` 2622 |
| Owner approval for deadline changes | IMPL: 2981, 3042, `logDeadlineChange` 291 |
| Audit log of task changes | IMPL: `applyTaskUpdate` 12643-12699 |
| Sort by start date | IMPL: `sortTasksByStart` 653; `GanttView.tsx:72` |
| Program RAID signal in task detail | IMPL: 10429, used at 3725 |

### Views
| View | Status / evidence |
|---|---|
| Mind map (SVG, zoom/pan, ⋯ menus, + Program) | IMPL: 6289, ~6474-6515, `MindNode` 6562 |
| Outline (drag-and-drop, weight badges, credit pool banner) | IMPL: 6641, 6836-7038 |
| Gantt (day/week/month, today line, status colours) | IMPL: `GanttView.tsx:84,56,579` |
| Gantt dependency arrows | **PARTIAL**: reads `task.dependencyIds` (`GanttView.tsx:609-628`), but no UI sets it |
| Dashboard | IMPL: 7101-7224 |
| Decisions / Actions / Aggregation | IMPL: 4187 / 4744 / 5224 |
| Meeting mode | IMPL: 5518, 13352 |
| Search Ctrl/Cmd+K | IMPL: `SearchModal.tsx:62,456` |
| Kanban | **Not specced, not built** |

### Actions and decisions
| Feature | Status / evidence |
|---|---|
| Statuses Pending / Pushed to OP / InProgress / Done / Cancelled; priority H/M/L | IMPL: 4306-4308 |
| Action form with comment thread | IMPL: 4323 |
| Search; filters by PIC/status/priority; group by PIC; multi-select | IMPL: ~4780-5030 |
| Export to OpenProject Excel template | IMPL: 5181 |
| Email PICs (Gmail compose, HTML preview, copy helper) | IMPL: 4691, 1623, 1757, 5024 |
| Deep link / auto-open action | IMPL: 12497-12504 |
| Create action from My Work | IMPL: 4609, 12910 |
| Action audit diff-logger | IMPL: 12708-12777 |
| Sub-tasks with several PICs | IMPL: 4501/4554, 8861, 12747-12776 |
| RAID mitigations in Actions tab (separate section, not interleaved) | IMPL: 5047 |
| Decision form (decided-by multi-select, review-by +30 days) | IMPL: 3928, 3786 |
| Decision decay badge | IMPL: 627, 4120 |
| Inline follow-up status for decisions | IMPL: 12782 |

### Credit and weight
| Feature | Status / evidence |
|---|---|
| Credit pool, year, project-lead share | IMPL: 73, 13075-13078, ~14240-14300 |
| WeightBadge, effective weights | IMPL: 2768, 677 |
| Credit shares editor (auto/manual, 70/30, reset) | IMPL: 2840, 717, 688 |
| Engine `computeProjectCredits` | IMPL: 733 |
| Credit projection in task; credits column in Activity Dashboard | IMPL: ~3535; 7373/7439 |
| Lock/unlock weights with history | IMPL: ~14297-14330 |
| Credit Report (year, per PIC, drill-down, 3-sheet Excel) | IMPL: 11557, 11656-11692, 1127 |
| "My credit this year" in My Work | IMPL: ~11511 |

### My Work
| Feature | Status / evidence |
|---|---|
| `computeMyWork` (privacy filtered) | IMPL: 813 |
| Sections: needs attention, RAID, actions today/week/later, mentions, tasks owned/contributed, decisions, credit | IMPL: 10940, ~11180-11520, 8223 |
| Inline task row (status, done, update, extension, add action) | IMPL: 8394, 8526, 8254 |
| Inline action row (edit, comments, sub-tasks, Chat notify) | IMPL: 8542, 8686 |
| Inline mitigation row | IMPL: 8727 |
| Owner approves deadline requests inline | IMPL: 12940-13000 |
| Mentions marked seen after 5 s; tab badge | IMPL: 10978-10982, 12513, 12465-12472, 13335 |
| By urgency / By project (localStorage `myWorkViewMode`, default project) | IMPL: 10965-10976, 10847, 10528 |
| Step lines with NEXT marker | IMPL: 8333, 8350 |
| "Set as my default ⋆" | Built differently: user-menu dropdown (13712-13725) |
| Notification preferences UI | **SPEC ONLY**: dropped on purpose |
| Phase 5 notification backend (Cloud Functions, digest, push) | **SPEC ONLY** |

### RAID
| Feature | Status / evidence |
|---|---|
| Schema and migration `ensureProjectRaid` | IMPL: 97-131, 213-235, 12385 |
| Risk matrix, level badge | IMPL: 9129, 9180, 213 |
| Register view (program sidebar, filters, summary) | IMPL: 9980 |
| RAID card (approval, metadata, transitions, BoD flag) | IMPL: 9745 |
| Add form (4 type tabs) | IMPL: 9507 |
| Trend/review history; mitigation actions with comments | IMPL: 9404; 9307 |
| Approval Draft → PendingApproval → Active | IMPL: 12842-12847 |
| Diff-logger, delete | IMPL: 12807, 12888 |
| Owner badge for pending approvals | IMPL: 12475-12486, 13341 |
| PicPicker (name and email typeahead) | IMPL: 9196 |
| My Work RAID sections | IMPL: 1012, 10271 |
| Mitigations in Actions and My Work | IMPL: 1078, 1103 |
| **Portfolio RAID roll-up and BoD Escalation box** | **SPEC ONLY** |

### Team Overview
| Feature | Status / evidence |
|---|---|
| Team tab (workload, sort, last activity), Excel export | IMPL: 8938, 8906, 9005, 8960, 9065 |
| "View as" impersonation | IMPL: 12572-12584, `ImpersonationBanner` 8155, 13324 |

### Members / PIC identity
| Feature | Status / evidence |
|---|---|
| `deriveTeamMembers` | IMPL: 1377 |
| Contributor registry, 8 default departments | IMPL: 77, 13078, 14616 |
| Adopt / Merge / Remove unregistered names | IMPL: ~14657-14677, ~14126 |
| Legacy merge (~19 identity fields) | IMPL: ~13994 |
| `resolvePicValue` email → name in 3 pickers | IMPL: 1247, 2622, 3786, 9196 |
| Excel import warns on unknown PICs | IMPL: 13117-13163 |
| Guidance banner; "PIC names in this project" audit panel | IMPL: ~14340; 1264, 1334, 1352, ~14488 |
| PIC keyed by email; retire manual team row; fuzzy "Did you mean" | **SPEC ONLY** (Phase 2) |

### Analytics and reporting
| Feature | Status / evidence |
|---|---|
| Activity Dashboard (index, trend, coaching, radar, difficulty, PIC drill-down) | IMPL: 317, 572, 605, 7330, 7472, 7517, 7582 |
| Portfolio (heatmap, workload, 12-week calendar, stress, sparklines) | IMPL: 7757, 7977-8150 |
| Weekly Briefing (Markdown, rich text, .md, Gmail) | IMPL: 11871, 12038, 12198 |
| Monday banner | IMPL: 13377-13409 |
| Meeting minutes | IMPL: 5678, 5893, 6106 |
| Default landing view and personal override | IMPL: 84, 12490-12567, 13690-13725 |

### Google Chat
| Feature | Status / evidence |
|---|---|
| Per-project webhook, prefix check, owner edit, test button | IMPL: `chatNotify.js:7-25,216`; 14712-14740 |
| Notify on comments (opt-in), on create, card redesign | IMPL: `chatNotify.js:53,123-215`; 4337, 4823, 12922, 3301 |
| Deep link `?project=&action=` | IMPL: 12410-12426 |
| Stage 2: DM or real ping | **SPEC ONLY** (waiting on IT) |
| Notify for task, decision or RAID; SMTP email | Not built (non-goal) |

### Import, export, log, onboarding
| Feature | Status / evidence |
|---|---|
| Excel import (aliases, drag-drop) / export MasterPlan | IMPL: 1469, 1523, 14789 / 1573 |
| Exports: OpenProject, Aggregation, Credit, Team | IMPL: 5181, 5297-5345, 11656, 9065 |
| Activity log (500 entries, "from My Work", "acting as") | IMPL: 12603, 12613; `storage-shim.ts:44` |
| OpenProject API | **SPEC ONLY** |
| Walkthrough (7 steps, spotlight, "?" to replay) | IMPL: `Walkthrough/steps.ts:35-101`, `useWalkthrough.ts:72-78`, 13564, 13280 |

## A3. Specced but not built, or deferred
1. RAID Phase 5: Portfolio RAID roll-up and the BoD Escalation box.
2. Notification-preferences UI (dropped on purpose) and the Phase 5 backend (digest, push, Cloud Functions).
3. Google Chat Stage 2 (needs a service account and Chat App from IT).
4. Members Phase 2: PIC keyed by email; retire the manual team row; fuzzy match; cross-project audit.
5. Mitigation follow-ups: show mitigations mixed into the action list; comment threads on mitigations; mitigations across projects; scroll to the item.
6. Future ideas: OpenProject API, Gmail attachments, multi-PIC "Phase 3", sub-collections if the 1 MB limit gets close.
7. Walkthrough non-goals: mobile, i18n, tour per role, telemetry.
8. Kanban: never specced.

## A4. Known issues and gaps (from code, not in the docs)
- Real-time sync is described but not active, so edits overwrite each other.
- Workspace owner is trusted from the client (`firestore.rules:61-62`). `isOwner` also accepts a display-name match (12452).
- No role checks in the UI. Writes from a member are rejected, and the user gets no warning.
- The Chat webhook URL is readable by every member.
- Gantt arrows have no way to enter links. `project.color` has no setter. `renameCurrentProject` is dead code.
- Stale text: the restore dialog still says "artifact" (13184). README is out of date (`main.jsx`, `auth.jsx`, "~1750 lines", "Viewer").
- Repo clutter: the backup files, the v29 reference, untracked `MyWorkViews.jsx`, and `CRPRaid.jsx` (a tracked prototype).
- Risks the docs already note: Chat limit of 60 messages/min; `collectProjectPicNames` and the merge tool must be kept in sync by hand; an open RAID pane doesn't refresh after a mitigation changes; free-text PIC is still allowed; last-write-wins.
- No TODO or FIXME comments in `src/`.

---

# PART B — Technical audit

**Biggest risks:**
- **Ownership takeover:** any @smartosc.com user can write `workspaceOwner`.
- **Lost updates:** a whole-document save with no realtime and no conflict check means concurrent edits overwrite each other.
- **Hidden failures:** save errors are swallowed.
- **Roles ignored:** the UI never reads `roles`.
- **No safety net:** App.jsx is 14,811 lines with zero tests.

## B1. Stack, build, deploy, env
| Item | Value | Cite |
|---|---|---|
| Runtime deps | react/react-dom ^18.3.1, firebase ^11.0.0, lucide-react ^0.400.0, xlsx 0.20.3 (SheetJS CDN tarball) | package.json:19-25 |
| Dev deps | vite ^5.4, @vitejs/plugin-react ^4.3.1, typescript ^5.5, eslint ^8.57 + plugins, prettier ^3.3.3, firebase-admin ^12 (scripts only) | package.json:26-41 |
| Scripts | dev, `build` = `tsc --noEmit && vite build`, preview, typecheck, lint, format, migrate. **No `test` script** | package.json:7-17 |
| vite.config.js | react plugin, port 5173, outDir dist, no sourcemap, no manualChunks | vite.config.js:1-8 |
| Bundle | App ~1.02 MB, index ~613 KB; only App and auth are lazy-loaded | main.tsx:13-16 |
| vercel.json | Headers only (CSP, HSTS, XFO, etc.); no rewrites, no functions | vercel.json:1-24 |
| `.vercel/` (gitignored) | Project `af-mpt`, vite, node 24.x; one local prebuilt deploy (CLI 53.1.0, 2026-05-05); `.env.production.local` holds a sensitive `VERCEL_OIDC_TOKEN` (local only) | .vercel/* |
| Backend | None. Pure SPA talking to Firebase and Google Chat | |
| Rules deploy | Pasted by hand into the console; no firebase.json | firestore.rules:23; README:93 |
| scripts/ | `migrate.js`, `setup-rbac.js` (Admin SDK; need `service-account.json`, gitignored) | |

Required env vars:
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`: public client config.
- `VITE_ALLOWED_DOMAIN`: defaults to smartosc.com.

## B2. Source structure
| File | Lines | Git | Purpose |
|---|---|---|---|
| App.jsx | **14,811** | tracked | Monolith: all UI, logic, Excel, minutes, briefing, RAID, My Work, credits, settings, App root |
| CRP_Project_Tracker_v29_reference.jsx | 10,453 | gitignored | Dead code, but still linted |
| App.jsx.before-v21.backup / before-features.backup / App.secured-backup.jsx | 6,912 / 5,046 / 2,196 | gitignored | Dead code |
| CRPRaid.jsx | 922 | tracked | RAID prototype, not imported |
| MyWorkViews.jsx | 582 | untracked | Prototype with hard-coded TODAY and ME |
| components/MembersModal.tsx | 745 | tracked | RBAC members and related parties |
| components/GanttView.tsx | 727 | tracked | Gantt |
| components/SearchModal.tsx | 470 | tracked | Ctrl+K search, 60 s cache |
| data.ts | 406 | tracked | Typed Firestore layer, mostly unused |
| storage-shim.ts | 420 | tracked | `window.storage` → Firestore. **The real data layer** |
| Walkthrough/* | 317 + 172 + 108 | tracked | Onboarding tour |
| chatNotify.js | 269 | tracked | Google Chat cards and POST |
| auth.tsx | 214 | tracked | AuthProvider / AuthGate |
| types.ts | 105 | tracked | Out of date |
| main.tsx / firebase.ts / seed.* | 104 / 33 / 8 | tracked | Bootstrap / init / stub |

What's inside App.jsx:
- 172 top-level functions, about 103 of them components, plus 1 class (ErrorBoundary).
- 211 `useState` and 26 `useEffect` calls.
- `App()` is about 1,450 lines (12321-13770). `ProjectSettingsModal` is about 990 lines.
- Design tokens are redefined in 4 or more files.

## B3. Data model and persistence

**Firestore paths:**
- `workspaces/main`: meta (workspaceOwner, ownershipLog, userPreferences, defaultView, …). Written with `setDoc merge:true`.
- `workspaces/main/projects/{pid}`: the whole project tree plus memberIds, roles, createdBy, deletedAt, updatedAt.
- `workspaces/main/activity/{pid}`: `{entries[]}`, newest first, max 500.
- `workspaces/main/users/{uid}`: directory.
- `users/{uid}`: private preferences and the tour flag.

**Project doc shape:**
- Top level: `name`, `teamMembers[]`, `googleChatWebhook`, `openProjectCode`, `creditPoints`, `creditYear`, `weightsLocked`, `weightsLockHistory`, `weightChangeLog`, `projectLead`, `projectLeadShare`, `contributorRegistry`, `metrics`, `relatedParties`.
- `programs[]` → `{id, name, raid[], workstreams[] → {id, name, tasks[]}}`.
- Task fields: id, name, status, pic, start, end, duration, deliverables, dependencies, dependencyIds, checkIns[], updates[], contributors, creditShares(+Mode), deadlineType, deadlineRequest(+History), deadlineHistory, health, healthNote, references[], steps, weight.
- `actionItems[]`: id, timestamp, title, description, pic, dueDate, priority, relatedTaskId, status, openProjectWpId, author, subtasks[], updates[].
- `decisions[]`: id, timestamp, text, date, decidedBy, context, relatedTaskIds, followUpStatus, meetingRef, expectedReviewDate, author.
- RAID: id, type, title, owner, status, createdBy/At, approvedBy/At, trend, lastReviewedAt, history[], mitigationActions[]. Risks also carry likelihood, impact, mitigationPlan and escalateToBoD. `riskLevel` is computed, never stored.

**How saving works:**
- **Whole-document writes:** `setDoc` with no merge (storage-shim.ts:294-302), after a `getDoc` that keeps the ACL fields.
- **400 ms debounce** (12592-12596).
- **No `onSnapshot`** in App.jsx. Data loads once (12365-12428). Last write wins.
- **No version field, no transaction.** The activity log is read-modify-write.
- **Errors are swallowed** (storage-shim.ts:340-343); `persistProject` ignores the result (12595).
- **A second write path:** MembersModal writes through `data.ts saveProject` (merge:false) on a live copy, while the App holds a stale copy, so the two can overwrite each other.

**firestore.rules:**
- **Domain gate:** `email_verified` plus a regex for @smartosc.com, hard-coded (29-33).
- **`workspaces/main`:** any smartosc user can read and write (61-63).
- **Projects:**
  - Read: members.
  - Create: any smartosc user, who must list themselves as owner.
  - Update: owner can change everything (at least one owner must remain). Operator can change content but not roles, memberIds, name, deletedAt or createdBy.
  - Delete: owner.
  - `member` is read-only (71-103).
- **Activity:** read by members. Create/update by **any member, including read-only**; the only checks are on `entries[0].author` and size ≤ 500. Delete denied (109-129).
- **`workspaces/main/users/{uid}`:** read by smartosc users, written only by that user. **`users/{uid}`:** that user only.

## B4. Auth and roles
- **Sign-in flow:** `signInWithPopup` with `hd` and `select_account`; client checks the domain suffix; upserts the directory entry; AuthGate; ShimUserSync.
- **Two role systems:**
  1. Per-project RBAC, enforced by the rules and managed in MembersModal. **App.jsx never reads `roles`.**
  2. Workspace owner, `meta.workspaceOwner`, checked **only on the client**. The check also accepts a display-name match. Anyone can "Become owner" if no owner is set. There is transfer/release. Owner-only features (Team, View as, RAID and deadline approvals, default view, Credit, Portfolio) are **not enforced server-side**.
- **Identity** for My Work, mentions and `userPreferences` is the display-name string. No allowlist, only the domain.

## B5. Integrations
- **Google Chat:**
  - The browser `fetch`es the webhook directly. Validation is only a URL-prefix check.
  - The URL is stored in the project doc, readable by every member.
  - Cards are cardsV2, with a test button.
  - The deep-link base URL is hard-coded to `https://af-mpt.vercel.app`.
  - The notify checkbox preference is kept in localStorage.
- **Excel (SheetJS):** import with column aliases; project export; OpenProject template (sheet "Template Task"); Team Overview and Credit Report exports.
- **Gmail:** compose-URL builder and HTML copy helper (uses `escapeHtml`; CSP blocks inline scripts).
- **JSON backup/restore**; minutes and briefing generators in Markdown/HTML.

## B6. Quality
| Area | State |
|---|---|
| Tests | **None** |
| TS/JS | Mixed. `allowJs` on, `checkJs` off, so App.jsx is not type-checked |
| Typecheck | Passes |
| Lint | 69 problems (6 errors, 63 warnings). 2 errors in App.jsx:8696, 8698; 4 in the v29 reference. Build doesn't run lint |
| Prettier | Not enforced (App.jsx has lines over 300 characters) |
| CI | None |
| Error handling | 1 ErrorBoundary and BootError; about 60 quiet catches |
| Git | 148 commits, 2026-04-29 → 2026-06-08. haleytruong89-moon 134, Ha Truong Thi Thu 12, ai-bo-02 2. By month: 04 = 2, 05 = 132, 06 = 14 |

## B7. Risks and technical debt
| # | Severity | Finding |
|---|---|---|
| 1 | H security | Workspace owner can be taken over (rules 61-63; App 12449-12453, 13030-13047) |
| 2 | H data | Lost updates: no realtime, whole-doc writes, stale meta written back (storage-shim 294; App 12365-12428, 12592-12596, 13026-13028) |
| 3 | H data | Silent save failures (storage-shim 340-343; App 1448, 12595) |
| 4 | H scale | 1 MiB document limit for the whole project; activity is a single 500-entry document |
| 5 | M security | RBAC not applied in the UI; `canEdit` unused; operator can rename in the UI but not in the rules |
| 6 | M security | Webhook readable by all members; posted from the browser |
| 7 | M security | Activity log can be rewritten by any member |
| 8 | M security | Restore JSON from the client; domain in rules vs env drift |
| 9 | M maintainability | 14.8k-line monolith, no tests, no type-checking |
| 10 | M maintainability | Duplicate persistence layers; about 13 `data.ts` exports unused |
| 11 | L/M | Identity by display name |
| 12 | L | Dead code: CRPRaid, MyWorkViews, v29 reference and backups (~24.6k lines), seed stub, stale types |
| 13 | L | Duplicated code: due label in chatNotify (136-145 vs 248-256); design tokens |
| 14 | L perf | ~1 MB chunk; xlsx not lazy-loaded; projects loaded one after another; cross-project computation on every render |
| 15 | L ops | Hard-coded deep link; no CI; rules pasted by hand; deploy from a local machine |
