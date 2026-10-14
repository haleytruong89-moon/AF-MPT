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
```
Chưa có `npm test`, chưa có CI. Test đầu tiên dự kiến: Firestore rules qua Firebase Emulator (pha P2).

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
| Dữ liệu bị ghi sai / mất | Restore JSON backup theo project (bản 14/10 + bản mới nhất trước mỗi pha) qua chức năng restore trong app hoặc `scripts/migrate.js`. Mất tối đa: dữ liệu từ lần backup gần nhất. **Chưa rõ** Firestore PITR / scheduled export có bật không — không kiểm được từ máy (không có Firebase CLI/gcloud); HOD kiểm trên console (DESIGN 6.8) | HOD |
| Chuyển đổi dữ liệu v2 lỗi | Document project cũ giữ nguyên tới M6; đặt lại `schemaVersion: 1` | HOD |

**Quy tắc:** trước mỗi pha có đụng dữ liệu → HOD xuất JSON + Excel tất cả project.

## Current Status

- Phase (vibe-code): **4 — Iterate & Debug**, có loop-back về Phase 1–2 (spec phân quyền v2 đã viết và đã đối chiếu code)
- Last updated: 14/10/2026
- Commit production: `8971f1a` (8/6/2026), không commit nào sau đó (đã kiểm `git log` 14/10; `main` = `origin/main`)
- Workspace Owner trên production: HOD (đã xác nhận 14/10, "1 change logged")
- Đã xong: audit 14/10; spec roles-permissions v2 (draft, 4 quyết định chốt); bridge files; **xác minh trên code** (`docs/DESIGN.md` mục 6) — khớp audit, thêm 2 rủi ro mới (#12 reset ACL khi `getDoc` lỗi, #13 restore sửa author log) và tìm ra gốc lỗi trùng tên (DESIGN 6.1)
- Đã xong (vòng 2): rà soát phân quyền + UI/UX + thị trường (`docs/reviews/2026-10-14-permissions-uiux-market-review.md`); HOD chốt 7 quyết định (uid, `ownerUids[]`, restricted mặc định, duyệt mọi project, nhãn EN, đa workspace trong P2, test trên GitHub Actions)
- Đang làm: chờ HOD duyệt PR #1 (docs) → viết plan B1
- Tiếp theo: **B0** CI GitHub Actions + `firebase.json` + test rules emulator → B1 khóa `workspaceOwner` (+ Transfer lưu email, ẩn Release/"Become owner") → B2 báo lỗi khi lưu thất bại (+ chặn reset ACL) → B3 cảnh báo lưu đè → B4 panel task kéo rộng + ẩn nút nguy hiểm với non-Owner + Dropped thay xóa cứng + token màu AA
- HOD cần kiểm trên console: gói Firebase + PITR/export (DESIGN 6.8); kích thước doc CRP (6.9)
- Câu hỏi mở chờ HOD: giả định A1–A4, Q1–Q6 trong spec v2
- Chưa onboard cả phòng cho tới khi xong B + P1 + P2
