# AF-MPT — AF Master Project Tracker

Master project tracker của phòng Kế toán - Tài chính (AF), SmartOSC. Ghi nhận **việc có kế hoạch** (dự án lớn, BAU lớn) theo cây Project → Program → Workstream → Task, kèm Action, Decision, RAID, Credit, My Work, Portfolio, Weekly Briefing.
Việc phát sinh qua email **không** thuộc app này (đã có PMO Tracker).

- Production: https://af-mpt.vercel.app
- Repo: `github.com/haleytruong89-moon/AF-MPT`, nhánh `main`
- Chủ sản phẩm / Workspace Owner: HOD AF — Hà Trương Thị Thu (`hattt4@smartosc.com`)
- Người bảo trì: 1 người (HOD + Claude)

## Đọc trước khi làm bất cứ gì

1. File này.
2. `docs/SPEC.md` — app để làm gì, phạm vi đợt hiện tại, tiêu chí nghiệm thu.
3. `docs/DESIGN.md` — kiến trúc hiện tại và đích, rủi ro, phân pha.
4. `docs/superpowers/specs/2026-10-14-roles-permissions-v2-design.md` — spec chi tiết phân quyền v2 (đã chốt 12 quyết định, §2 + §2.1).
5. `docs/reviews/2026-10-14-permissions-uiux-market-review.md` — rà soát phân quyền, UI/UX, so sánh thị trường, hướng đa workspace.
6. Bằng chứng: `docs/handover/HANDOVER_AFMPT_2026-10-14.md`, `docs/handover/AUDIT_APPENDIX_2026-10-14.md` (trích dẫn file:dòng tại commit `8971f1a`).

**Nguồn đúng = code + `docs/`.** `README.md` và `src/types.ts` đã lỗi thời (nói có realtime sync, gọi role là "Viewer", cấu trúc file cũ). Không dựa vào chúng.

## Tech Stack

- Framework: React 18 + Vite 5 (SPA), JS + TS trộn (`allowJs`, `checkJs` off → `App.jsx` không được type-check)
- UI: lucide-react, CSS/design token tự viết (lặp ở ≥4 file)
- Database: Firebase Firestore (client SDK v11), **không có backend / serverless**
- Auth: Firebase Auth, Google sign-in, chỉ `@smartosc.com`
- Excel: SheetJS `xlsx` 0.20.3 (tarball CDN)
- Hosting: Vercel (project `af-mpt`), chỉ có headers trong `vercel.json`
- Tích hợp: Google Chat incoming webhook (một chiều, gọi từ trình duyệt), Gmail compose link
- Module vận hành trong skill vibe-code: **chưa có module cho Firebase + Vercel** → chỉ áp dụng nguyên tắc lõi của skill

## Cấu trúc mã cần biết

| File | Vai trò |
|---|---|
| `src/App.jsx` (~14.8k dòng) | Monolith: toàn bộ UI + logic. `App()` ~12321–13770 |
| `src/storage-shim.ts` | **Đường lưu dữ liệu thật**: `window.storage` → Firestore |
| `src/data.ts` | Lớp Firestore có type, phần lớn không dùng (có `canEdit`, `roleOf`, onSnapshot hooks chưa được import) |
| `src/components/MembersModal.tsx` | RBAC members; **ghi qua đường riêng** (`data.ts saveProject`) → có thể ghi đè chéo |
| `firestore.rules` | Luật phân quyền, hiện **dán tay** vào Firebase console |
| `scripts/` | Admin SDK (`migrate.js`, `setup-rbac.js`), cần `service-account.json` (gitignored) |
| Bỏ qua | `*.backup`, `App.secured-backup.jsx`, `CRP_Project_Tracker_v29_reference.jsx` (gitignored, code chết), `src/CRPRaid.jsx`, `src/MyWorkViews.jsx` (prototype) |

## Lệnh

```bash
npm run dev         # localhost:5173
npm run build       # tsc --noEmit && vite build
npm run typecheck
npm run lint        # hiện 6 errors / 63 warnings — không làm tăng thêm
npm run test:rules  # Firestore rules trên Emulator (cần Java 21 — máy dev không có, chạy trên CI)
```
CI: GitHub Actions (`.github/workflows/ci.yml`) chạy typecheck + unit test (nếu có) + rules test cho mọi PR và push vào `main`. **CI xanh là cổng bắt buộc trước khi merge và trước khi deploy rules.** Test rules ở `tests/rules/`, project emulator `demo-afmpt`.

## Conventions

- Giao tiếp với HOD: **tiếng Việt**. Code, comment, commit, tên file/hàm: **tiếng Anh**. Thuật ngữ trong app giữ tiếng Anh (owner, PM, PIC, RAID…).
- Quy trình: brainstorm → spec (`docs/superpowers/specs/YYYY-MM-DD-*-design.md`) → plan (`docs/superpowers/plans/`) → implement theo plan, từng task nhỏ.
- Commit: conventional commits — `feat(scope):`, `fix(scope):`, `docs(spec):`, `docs(plan):`, `chore:`.
- Git: **linear PRs** — 1 PR nhỏ, 1 mục đích → merge → nhánh mới từ `main`. PR có đổi dữ liệu/rules phải ghi rõ trong mô tả và kèm cách hoàn tác.
- Đưa khuyến nghị rõ ràng, không liệt kê mọi phương án. Dám phản biện.

## Key Decisions

| Ngày | Quyết định | Lý do |
|---|---|---|
| (v2–v30) | Chỉ đăng nhập `@smartosc.com`; bỏ menu Rename project; bỏ UI tùy chọn thông báo; chỉ notify Chat cho Action | Theo spec cũ |
| 14/10/2026 | **Phạm vi đợt:** vá an toàn + thiết kế lại phân quyền & định danh (vượt ràng buộc "không thêm tính năng" ban đầu, có chủ đích) | Điểm chưa ưng #1, #3, #5 cùng gốc phân quyền/định danh |
| 14/10/2026 | **Phân quyền thực thi ở server**: tách workstream và task thành document riêng | Rules không duyệt được mảng lồng nhau; dữ liệu dùng chấm performance |
| 14/10/2026 | **Duyệt Done/Dropped 1 cấp** (quản lý trực tiếp), Owner ghi đè; Action PIC tự đóng | Tránh nghẽn ở Owner |
| 14/10/2026 | **Sửa plan lẻ không cần duyệt** nếu trong hạn workstream; upload hàng loạt + đổi hạn WS/program/project cần Owner duyệt | Ít ma sát cho việc hằng ngày |
| 14/10/2026 | Vai trò: Owner / PM (program) / Sub-PM (workstream) / Assignee / Viewer. ~~Mọi trường người lưu email~~ → **thay bằng quyết định uid bên dưới** | Hết trùng tên |
| 14/10/2026 (vòng 2) | **Định danh theo `uid`**: `members/{uid}`, mọi trường người lưu uid; `invites/{email}` cho người chưa đăng nhập | Chuẩn thị trường: ID bất biến; rules so `request.auth.uid` |
| 14/10/2026 (vòng 2) | **`ownerUids[]`** (cấm rỗng). Hiện chỉ HOD; Owner thứ 2 chọn sau. B1 ẩn Release | Tránh điểm hỏng duy nhất |
| 14/10/2026 (vòng 2) | **Project mặc định `restricted`** (chỉ thành viên dự án + Owner); Owner đổi sang `department` trong Project Settings, có ghi log | Dự án nhạy cảm (MA, UBO) thay đổi theo năm |
| 14/10/2026 (vòng 2) | **Duyệt Done/Dropped cho tất cả project**; cấm tự duyệt; chuyển người duyệt có log; quá 3 ngày đẩy lên cấp trên; View as chỉ đọc | Dữ liệu dùng chấm performance |
| 14/10/2026 (vòng 2) | **Nhãn UI tiếng Anh** (Pending approval, Submit as done, Approvals) | Ít việc nhất; UI hiện đã 100% EN |
| 14/10/2026 (vòng 2) | **Chuẩn bị đa workspace ngay trong P2**: `workspaces/{wid}` là biến (AF = `main`), thành viên/vai trò theo workspace, cấu hình AF vào `config`, bỏ domain/URL gắn cứng; chưa làm UI chuyển workspace | Mở rộng phòng ban sau này không phải chuyển dữ liệu lần 2 |
| 14/10/2026 (vòng 2) | **Test rules chạy trên GitHub Actions** (Firebase Emulator), bắt buộc xanh trước mọi lần deploy rules, kể cả B1 | Máy không có Java; đồng thời là CI đầu tiên |
| 14/10/2026 | **Không viết lại, không tách App.jsx hàng loạt.** Adapter trong `storage-shim.ts` giữ nguyên hình dạng cây trong bộ nhớ | Một người bảo trì, không có test |
| 14/10/2026 | **Mức tự động hóa:** cơ bản + kỷ luật (push `main` → Vercel tự deploy). Nâng dần: rules vào repo + deploy bằng Firebase CLI + test emulator trước P2 | Dữ liệu thật của phòng, sắp onboard cả phòng |
| 14/10/2026 | AF 2026 Key Results và AF 2026 Operation **không phải rác** — là khung pilot cho mô hình Sub-PM theo workstream | Xác nhận với HOD |

## Warnings — KHÔNG được làm

- **Không ghi, xóa, sửa dữ liệu Firestore production** (kể cả qua script Admin SDK) khi HOD chưa duyệt từng lô qua bản xem trước.
- **Không deploy rules mới** khi chưa có test emulator xanh cho đúng thay đổi đó, và chưa giữ bản rules cũ để hoàn tác.
- **Không tách / refactor `App.jsx` hàng loạt.** Mỗi thay đổi tối thiểu cho đúng mục tiêu, revert được bằng 1 commit.
- **Không thêm tính năng ngoài spec đã duyệt.** Không đồng bộ hai chiều với tool khác (PMO Tracker, OpenProject).
- **Không deploy prebuilt từ máy local** (`vercel --prebuilt`). Một đường deploy duy nhất: merge vào `main`.
- **Không commit secret**: `service-account.json`, `.env*`, `.vercel/` (có `VERCEL_OIDC_TOKEN`). Firebase web config là public, được phép.
- **Không xóa cứng task** — chuyển `Dropped`.
- Không tin `README.md` / `src/types.ts`.

## Rollback (trả lời trước khi có thay đổi)

| Sự cố | Cách quay lại | Ai |
|---|---|---|
| Code hỏng sau deploy | Vercel → Deployments → *Promote* bản trước; rồi `git revert` commit lỗi trên `main` | HOD |
| Rules mới chặn sai | Deploy lại bản rules trước (lưu trong git) | HOD |
| Dữ liệu bị ghi sai / mất | Restore JSON backup theo project (bản 14/10 + bản mới nhất trước mỗi pha) qua chức năng restore trong app hoặc `scripts/migrate.js`. Mất tối đa: dữ liệu từ lần backup gần nhất. **Gói Spark: không có PITR / scheduled export** → Backup JSON trong app là đường khôi phục duy nhất; HOD xuất JSON + Excel trước mỗi pha đụng dữ liệu (DESIGN 6.8) | HOD |
| Workspace mất owner / owner lưu sai | Firebase Console → Firestore → `workspaces/main` → sửa tay `workspaceOwner` = email owner (chữ thường), hoặc script Admin SDK. Client không claim được nữa (B1) | HOD |
| Danh bạ P1 ghi sai | `npm run p1:directory -- --rollback <manifest>` (mới nhất trước), rồi rules bản 22/10 12:15 trên Console; sau Promote thì `git revert` merge trên main | HOD |
| Chuyển một project sang v2 lỗi | Báo mọi người trước. `npm run p2:migrate -- --rollback <pid>` (xem trước, in mã hash) → HOD duyệt → thêm `--apply --expect <hash>`. Nếu từ chối vì đã có sửa trên v2: đọc danh sách, rồi dùng `--force-with-report --delete-v2-docs` (ghi file dữ liệu mất trước). Sau đó mọi người hard-refresh. Document v1 giữ nguyên tới P2.5 | HOD |
| Project v2 cần restore | Restore trong app **từ chối** nếu bản backup làm mất task hoặc xóa sạch comment (P2.3, Ruling AA) → restore qua script Admin SDK (preview → HOD duyệt), hoặc đặt lại `schemaVersion: 1` rồi restore v1 | HOD |
| Pilot copy P2 | `node scripts/p2-pilot-copy.mjs --rollback <manifest>` (chỉ xóa đúng các path đã ghi; từ chối nếu target không phải pilot) | HOD |

**Quy tắc:** trước mỗi pha có đụng dữ liệu → HOD xuất JSON + Excel tất cả project.

## Current Status

- Phase (vibe-code): **4 — Iterate & Debug**, có loop-back về Phase 1–2 (spec phân quyền v2 đã viết và đã đối chiếu code)
- Last updated: 25/10/2026
- Commit production: `2006675` (24/10/2026, P2.2 + plan P2.3 #19), Vercel tự deploy từ `main`
- Firestore rules production: **bản P2.2** (gồm P2.1), HOD publish qua Console 23/10/2026. Hoàn tác = chọn lại bản trước trong lịch sử Rules trên Console
- `workspaces/main.ownerUids` = [uid HOD], ghi 23/10 05:01 (manifest `p2-owner-uids-manifest-2026-10-23T05-01-27-009Z.json`, gitignored). Pilot copy Treasury 2026 (P2.2) đã tạo, so khớp, HOD xem, rồi rollback
- Workspace Owner trên production: HOD (đã xác nhận 14/10, "1 change logged")
- Đã xong: audit 14/10; spec roles-permissions v2 (draft, 4 quyết định chốt); bridge files; **xác minh trên code** (`docs/DESIGN.md` mục 6) — khớp audit, thêm 2 rủi ro mới (#12 reset ACL khi `getDoc` lỗi, #13 restore sửa author log) và tìm ra gốc lỗi trùng tên (DESIGN 6.1)
- Đã xong (vòng 2): rà soát phân quyền + UI/UX + thị trường (`docs/reviews/2026-10-14-permissions-uiux-market-review.md`); HOD chốt 7 quyết định (uid, `ownerUids[]`, restricted mặc định, duyệt mọi project, nhãn EN, đa workspace trong P2, test trên GitHub Actions)
- Đã xong: B0 — CI GitHub Actions + harness test rules (PR #2); plan B0+B1 `docs/superpowers/plans/2026-10-14-b0-b1-rules-ci-and-owner-lock.md`
- Đã xong: B0 merged (PR #2)
- Đã xong (22/10): đợt B merged + deploy. PR #3 B1 owner lock; #4 B2/B3 save banner + `rev` stale-write guard + ghi tuần tự theo project; #5 B4 task panel resize/expand, Drop thay xóa, Undo, owner-only Restore/Delete project, contrast AA, Esc modal; #7 follow-ups; #8 tay kéo panel nhìn thấy được. Plan: `docs/superpowers/plans/2026-10-14-b2-b4-save-safety-and-task-panel.md`
- Nợ kỹ thuật từ review đợt B: (1) kiểm `rev` chưa nguyên tử → đổi sang `runTransaction` trước khi onboard cả phòng; (2) helper thành viên trong `data.ts` tính `memberIds`/`roles` từ snapshot → dùng `arrayUnion`/`arrayRemove`/`roles.<uid>` (P2.3 đã làm cho `memberUids`; `memberIds`/`roles` còn); (3) Esc đóng Modal kể cả form đang sửa dở
- Đã xong (23/10): **P1** merged (PR #11) + danh bạ ghi lên production 23/10 06:47 (7 `members`, 2 `invites`; manifest `p1-directory-manifest-2026-10-22T23-47-22-726Z.json` ở máy HOD, gitignored). HOD đã đối chiếu Credit/Activity. Tên hiển thị = username (HOD chọn); tên cũ là alias. Còn: HOD deactivate **Vannh** (đã nghỉ) trong People directory; HOD thu hồi service-account key đã dùng (file local đã xóa)
- Nợ kỹ thuật P1 (Ruling S, T): My Work bỏ sót item lưu dưới tên Google của người thêm sau apply → `isMe` nhận cả `meKey` lẫn `personKey(author)`; lỗi trùng tên Google chặn `--apply` nhưng không nói nguồn → ghi nguồn trong thông báo
- Đã đo (23/10, backup 22/10): doc lớn nhất CRP = 77 KB / 187 task (giới hạn 1 MiB) → rủi ro #4 thấp
- Q4 (22/10): roster do HOD lập, chỉ Owner thêm người. Q5: `pmoTag` để sau P2
- Ghi nhớ: project doc có trường `rev` (B3). Mọi đường ghi project phải đi qua `storage-shim.ts`; MembersModal chỉ `updateDoc` field thay đổi. Restore JSON bỏ qua stale guard nhưng không đụng trường owner
- Điều kiện B1 đã xong (14/10): HOD tự sửa `workspaces/main.workspaceOwner` từ tên → `hattt4@smartosc.com` trong Console; app vẫn nhận HOD là owner. Kích thước doc CRP đã kiểm (xem trên)
- Đã xong (23/10): Ruling S/T (#13), `runTransaction` + `writeId` cho kiểm `rev` (#14) → nợ kỹ thuật (1) đợt B đã đóng
- **P2** (roadmap `docs/superpowers/plans/2026-10-23-p2-roadmap.md`, mục "Contract fixed by P2.1" là ràng buộc cho P2.2–P2.4):
  - P2.1 merged (#16): split/assemble, dry-run, `ownerUids` (+ khóa Transfer ownership trong app khi đã set), rules v2 theo vai trò. Còn: HOD publish rules; chạy `p2-set-owner-uids` (preview → duyệt → apply); HOD điền `p2-assignments.xlsx`
  - P2.2 merged + deploy (#18): gate (trường v2 chỉ Owner, RAID docs `raid/{programId}` — Ruling K′, contributor chỉ thêm update), v1 save giữ trường v2 từ server, đọc project v2 (read-only), pilot copy + compare
  - P2.3 trên `feat/p2-3` (PR #20, plan `docs/superpowers/plans/2026-10-23-p2-3-write-path.md`): ghi v2 theo từng document trong transaction trên `version` (planner `src/planV2Save.js` + executor `src/execV2Save.js`), Decisions thành docs (Ruling Q), `authorUid` trên entry mới (Ruling R), activity v2 mỗi event 1 doc, MembersModal giữ `memberUids` đồng bộ, pilot copy nhận `--assignments`. Runbook trong PR #20
  - P2.4 trên `feat/p2-4` (PR #21, xếp chồng trên #20; plan `docs/superpowers/plans/2026-10-24-p2-4-switch-real-projects.md`): CLI `scripts/p2-migrate.mjs` chuyển tại chỗ từng project (pre-check, xem trước có mã hash, `--apply --expect <hash>`, đổi `schemaVersion` cuối cùng trong 1 transaction, chép activity, verify), rollback có phát hiện sửa trên v2; rules chỉ cho đọc/ghi sub-collection v2 khi project đang v2. Dry-run offline trên backup 22/10: 7/7 project ráp đúng, 0 chặn. Runbook trong PR #21. Chưa ghi gì lên production
  - Giới hạn đã chấp nhận tới P3: Assignee không tự đóng task (A4) và không resolve blocker (Ruling W); PIC biện pháp RAID không tự đánh Done (Ruling AG); đổi tên/trọng số program chỉ Owner; sửa bị từ chối nằm lại trong trang → phải Reload; PM một program không chuyển task sang program khác; sửa `teamMembers`/`contributorRegistry` của project v2 chỉ Owner; restore v2 làm mất task bị từ chối
- HOD quyết (23/10): Q1 Decisions/RAID do mọi PM/Sub-PM của project ghi; A2/A3 1 PM (+Deputy) / program, 1 Sub-PM / WS; A4 Assignee không tự Completed/Dropped; contributor chỉ thêm update
- Câu hỏi mở chờ HOD: giả định A1, Q2, Q3, Q6 trong spec v2
- Tiếp theo: HOD duyệt + merge #20 → #21 → P3 (đang code trên nhánh riêng, plan `docs/superpowers/plans/2026-10-24-p3-approvals.md`) → pilot vai trò trên bản copy Treasury 2026 → chuyển đợt 1 (AF 2026 Key Results, AF 2026 Operation, Treasury 2026) → 1–2 tuần → P2.4b script restore v2 → đợt 2 (MA, CRP, UBO, AF Lean) → onboard
- Chưa onboard cả phòng cho tới khi xong B + P1 + P2
