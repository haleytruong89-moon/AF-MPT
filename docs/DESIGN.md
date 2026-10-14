# AF-MPT — Design (as-is → to-be)

*Cập nhật: 14/10/2026 · Chi tiết rules, ma trận quyền, Hộp duyệt, chuyển đổi: `docs/superpowers/specs/2026-10-14-roles-permissions-v2-design.md`*
*Dòng trích dẫn theo commit `8971f1a`. Đã đối chiếu trên code ngày 14/10 (Claude Code), kết quả ở mục 6. Còn 2 mục cần HOD kiểm trên Firebase console (6.8, 6.9).*

## 1. Kiến trúc hiện tại (as-is)

```
Browser (React SPA, Vercel)
 ├─ Firebase Auth (Google, @smartosc.com)
 ├─ App.jsx ──window.storage──> storage-shim.ts ──setDoc(full doc)──> Firestore
 ├─ MembersModal ──data.ts add/remove member, setRole, setRelatedParties
 │                 → saveProject (merge:false, trên bản onSnapshot)──> Firestore   ← đường ghi thứ 2
 ├─ Walkthrough ──setDoc users/{uid}──> Firestore (riêng từng user, vô hại)
 └─ chatNotify.js ──fetch(webhook URL)──> Google Chat
```

**Firestore:**
```
workspaces/main                       meta: workspaceOwner, ownershipLog, userPreferences, defaultView
workspaces/main/projects/{pid}        CẢ cây project + memberIds, roles, createdBy, deletedAt, updatedAt
workspaces/main/activity/{pid}        { entries[] } tối đa 500, mới nhất trước
workspaces/main/users/{uid}           danh bạ
users/{uid}                           tùy chọn riêng, cờ walkthrough
```

**Cây project:** `programs[] → {id, name, raid[], workstreams[] → {id, name, tasks[]}}`, cùng `actionItems[]`, `decisions[]`, `teamMembers[]`, `googleChatWebhook`, credit settings, `contributorRegistry`, `relatedParties`.
Không có trường người phụ trách ở program/workstream. Task: `pic` (chuỗi tên), `contributors`, `start/end`, `status`, `health`, `updates[]`, `deadlineRequest`, `weight`, `references[]`…

**Đường lưu:** load 1 lần (`App.jsx` ~12365–12428) → sửa trong bộ nhớ → debounce 400 ms (~12592–12596) → `getDoc` giữ ACL → `setDoc` không merge (`storage-shim.ts` ~294–302). Lỗi bị nuốt (`storage-shim.ts` 340–343: `console.warn` rồi `return null`, **không ném lỗi**), nên `ssetShared` (`App.jsx:1448`) luôn trả `true`; `persistProject` (12592–12596) không xem kết quả. Không version, không transaction, không onSnapshot.

**Shim bỏ `memberIds`, `roles` khi đọc** (`storage-shim.ts` 187–190) → App không bao giờ thấy danh sách thành viên; nhánh danh bạ trong `deriveTeamMembers` (`App.jsx` ~1420) và `categorizePicName` (~1340) không bao giờ chạy.

**Quyền:** 2 hệ song song
- Role theo project owner/operator/member — rules thực thi (`firestore.rules` ~71–103), **UI không đọc**.
- Workspace Owner — chỉ kiểm ở client (`App.jsx` ~12449–12453), chấp nhận khớp tên hiển thị; `workspaces/main` mọi user domain ghi được (rules ~61–63).

## 2. Sổ rủi ro

| # | Mức | Rủi ro | Xử lý ở pha |
|---|---|---|---|
| 1 | H bảo mật | Tự thăng Owner (ghi `workspaces/main`) | **B1** |
| 2 | H dữ liệu | Last-write-wins, ghi đè cả doc | B3 (giảm nhẹ) → **P2** (giải gốc) |
| 3 | H dữ liệu | Lưu thất bại không báo | **B2** |
| 4 | H quy mô | 1 MiB/document | **P2** |
| 5 | M | UI không áp role | P2 + P4 |
| 6 | M | Webhook đọc được bởi mọi member | Q2 (sau P3) |
| 7 | M | Activity log ghi đè được | **P2** (append-only) |
| 8 | M | Restore JSON ghi đè từ client; domain hard-code trong rules | P2 |
| 9 | M | Monolith, không test, không type-check | Test rules ở P2; không refactor lớn |
| 10 | M | Hai đường ghi (shim + `data.ts`) | P2: dồn về 1 đường |
| 11 | L/M | Định danh bằng tên | **P1** |
| 12 | **M/H dữ liệu** *(mới, 14/10)* | `getDoc` lỗi tạm thời khi lưu (mạng chập chờn) → shim coi như doc chưa có → ghi `memberIds=[uid]`, `roles={uid:'owner'}` (`storage-shim.ts` 276–301). Nếu người lưu là owner, rules cho qua → **mất hết thành viên khác của project, không báo** | **B2** (gộp: lỗi đọc thì dừng lưu, không đoán) |
| 13 | L *(mới)* | Restore JSON ghi lại activity log: shim thay `author` dòng đầu bằng email người restore → log sai người | P2 |

## 3. Kiến trúc đích (to-be)

```
workspaces/{wid}   (AF: wid='main')              ownerUids[] (chỉ Owner sửa, không rỗng), config{departments, creditRules, defaultView, chat…}
workspaces/{wid}/members/{uid}                    email, displayName, aliases[], department, status(active|deactivated)
workspaces/{wid}/invites/{email}                  người chưa đăng nhập lần nào → gắn uid ở lần đầu
workspaces/{wid}/projects/{pid}                   meta + visibility(restricted*|department) + memberUids[]
                                                  + programs: MAP {programId: {name, pmUid, deputyUid, start, end, raid[]}}
  /workstreams/{wsId}                             programId, name, order, leadUid, start, end, version
  /tasks/{taskId}                                 programId, workstreamId, picUid, contributorUids[], status(+Submitted), version
  /actions/{actionId}                             picUid, workstreamId?, version
  /approvals/{reqId}                              type, scope, requestedBy, approverUid, payload, baseVersions, status
  /activity/{autoId}                              1 sự kiện/doc, chỉ create
  /private/settings                               googleChatWebhook (Owner + PM)
users/{uid}                                       hồ sơ chung + workspaceIds[] (cho bộ chuyển workspace sau này)
```
Mọi doc con mang `workspaceId` + `projectId` để query xuyên project (ví dụ My Work bằng collection-group query). `*` = mặc định.

**Nguyên tắc thiết kế:**
1. **Đơn vị phân quyền = đơn vị document.** Rules đọc `programs[ws.programId].pmUid` và `ws.leadUid` bằng `get()` (2–3 lần/request, giới hạn 10).
2. **Adapter, không viết lại.** `storage-shim.ts` ráp collection mới thành **đúng cây cũ** App.jsx đang dùng; khi lưu, so với bản đã load và chỉ ghi document thay đổi, có điều kiện `version`. App.jsx chỉ đổi ở điểm gọi lưu/xử lý lỗi và các trường người (`pic` → `picUid` + tên từ danh bạ).
3. **Một đường ghi.** MembersModal và mọi chỗ ghi trực tiếp khác chuyển về adapter.
4. **Mở rộng trước, thu gọn sau.** Document project cũ giữ nguyên (chỉ đọc) tới khi ổn định 2–4 tuần; `schemaVersion` quyết định app đọc đường nào.
5. **Sẵn sàng đa workspace, chưa làm UI.** `wid` là biến ở mọi đường dẫn, rules và adapter; không gắn cứng `'main'`, domain hay URL; cấu hình riêng của AF nằm trong `workspaces/{wid}.config`.
6. **Định danh theo uid, project mặc định restricted, `ownerUids[]`** (quyết định 14/10 vòng 2, spec v2 §2.1).
7. **Rules là code.** `firestore.rules` + `firebase.json` trong repo, deploy bằng `firebase deploy --only firestore:rules`, test bằng Emulator + `@firebase/rules-unit-testing` — mỗi dòng ma trận quyền ≥1 test cho phép + 1 test từ chối.

## 4. Giao diện (to-be, mockup duyệt ở P4)

- Tab: **Plan** (gộp Mind map/Outline/Gantt, nút chuyển kiểu xem) → **My Work** → **Approvals** → Actions / Decisions / RAID → Portfolio / Dashboard / Team → Briefing / Minutes / Credit. Nút Excel, tải, upload, Minutes gộp vào menu "⋯ Xuất/Nhập".
- Màn mặc định: Owner → Portfolio + Approvals; PM → Plan lọc program; Sub-PM → Plan lọc workstream; Assignee/Viewer → My Work. Tab không có quyền thì **ẩn**.
- Mind map/Outline hiện PM ở node program, Sub-PM ở node workstream.
- Panel task: kéo rộng + toàn màn hình; ô update tự giãn.

## 5. Phân pha và cổng kiểm

| Pha | Việc | Đụng dữ liệu? | Cổng qua |
|---|---|---|---|
| B1 | Rules: chỉ Owner sửa `workspaceOwner*`, `ownershipLog`, `defaultView`; bỏ khớp tên ở `isOwner`; **dialog Transfer phải lưu email** (hiện lưu tên hiển thị: `TransferOwnerDialog` ~12296 `value={m.name}` → `changeOwnership('transfer', newOwner)` 13761) | Không (rules) | Tài khoản thường bị từ chối; Owner vẫn chuyển được |
| B2 | Shim ném lỗi thay vì trả `null`; `ssetShared`/`persistProject` hiện toast lỗi + giữ trạng thái "chưa lưu"; `getDoc` lỗi (khác "không tồn tại") thì **dừng lưu**, không reset ACL (rủi ro #12) | Không | Tài khoản `member` sửa → thấy lỗi; mất mạng giữa chừng → không mất thành viên |
| B3 | So `updatedAt` trước khi lưu → cảnh báo "đã có người sửa, tải lại" | Không | 2 tab cùng sửa → tab sau bị cảnh báo |
| B4 | Panel task kéo rộng/pop-up | Không | HOD thử trên production |
| P1 | Danh bạ email + bảng ánh xạ tên → email (HOD duyệt) | **Có** | 1 người = 1 dòng |
| P2 | Tách document + adapter + rules + test + chuyển đổi M0–M5 | **Có** | Test rules xanh; báo cáo đối chiếu số lượng khớp; pilot 1–2 tuần |
| P3 | Approvals, `Submitted`, upload theo phạm vi | Có | Pilot duyệt Done + 1 upload WS |
| P4 | UI theo vai trò | Không | HOD duyệt mockup trước code |
| F | Dọn task quá hạn qua Sub-PM | Có (qua Approvals) | Quá hạn phản ánh thực tế |

Mỗi pha = 1 hoặc vài PR nhỏ, mỗi PR ghi cách kiểm tra trên production và cách hoàn tác.

## 6. Kết quả xác minh trên code (14/10/2026, nhánh `docs/bridge-files`, HEAD `8971f1a`)

| # | Mục | Kết quả |
|---|---|---|
| 1 | Git | **Khớp.** `main` = `origin/main` = `8971f1a`, không commit mới. Chưa commit: `Specs/FEATURES_SPEC_v30_mywork_views.md`, `docs/superpowers/plans/2026-05-19-task-sort-by-start-date.md`, `src/MyWorkViews.jsx` (để nguyên, ngoài PR này). `typecheck` sạch; `lint` 69 vấn đề (6 error / 63 warning; 2 error ở `App.jsx:8696,8698`, 4 ở file v29 reference). |
| 2 | `firestore.rules` | **Khớp.** Domain hard-code dòng 32. Dòng 61–62 là `match /workspaces/{workspace}` + `allow read, write: if isSmartOSC() && workspace == 'main'` → mọi user domain ghi được meta. Projects 71–102, activity 109–128, users 134–141. |
| 3 | `storage-shim.ts` | **Khớp**, thêm 2 phát hiện. `setDoc` project 294–302 (không merge); meta 261–265 (`merge:true`); `ACTIVITY_CAP` dòng 44; nuốt lỗi 340–343 trả `null` (không ném) → `ssetShared` luôn `true`. **Mới:** `getDoc` lỗi → reset ACL (rủi ro #12). **Mới:** đọc project bỏ `memberIds/roles` (187–190). |
| 4 | `App.jsx` | **Khớp** (file 14.811 dòng). Load 12365–12428; `isOwner` 12450–12453 (nhận cả `author === workspaceOwner`); `persistProject` 12592–12596; `changeOwnership` 13030–13056 ghi cả meta (`{...meta, workspaceOwner}`); `COL` 1469, `parseExcelFile` 1523 (`pic` lấy nguyên chuỗi ở 1555, **không** qua `resolvePicValue`), `ImportModal` 14789; `restoreJson` 13185–13197. |
| 5 | Điểm ghi ngoài shim | **Khớp audit, chi tiết hơn.** App.jsx chỉ ghi qua `window.storage` (`saveProject` 1457, `saveMeta` 1455, `appendActivity` 1460). Ngoài shim: `MembersModal.tsx` dùng `addProjectMember / setMemberRole / removeProjectMember / setRelatedParties` (`data.ts` 282–304) → `saveProject` `merge:false` (`data.ts` 249–258); `useWalkthrough.ts:78` ghi `users/{uid}`; `data.ts:63` ghi danh bạ lúc đăng nhập. Không có `writeBatch` / `runTransaction`. |
| 6 | Trùng tên trong Activity Dashboard | **Đã tìm ra gốc** (xem 6.1). |
| 7 | `data.ts` | **Khớp.** `canEdit`, `canRead`, `isOperator`, `useActivity`, `useProjects` không ai dùng. `roleOf`, `isOwner`, `useProject` chỉ MembersModal dùng. onSnapshot ở 79 (danh bạ, App có dùng), 150, 191, 315, 367 (App không dùng). |
| 8 | Gói Firebase, PITR, scheduled export | **Chưa kiểm được** — máy không có Firebase CLI/gcloud. **HOD kiểm:** Firebase console → Usage and billing (Spark/Blaze); Google Cloud console → Firestore → Disaster recovery (PITR) và Import/Export. |
| 9 | Kích thước doc CRP | **Chưa kiểm được** — không có file backup JSON trên máy. **HOD kiểm:** bấm Backup JSON trong app, xem kích thước phần `projects.<CRP>`; ngưỡng cảnh báo ~700 KB. |

### 6.1 Gốc lỗi "một người hai dòng" (hattt4@smartosc.com / Hà Trương Thị Thu)

- **Dashboard gom theo chuỗi thô, phân biệt hoa thường**, không đổi email → tên: `computeActivityIndex` `ensure(pic)` (323) trên `actionItems[].pic` (345), `task.pic` (375), `task.updates[].author` (453), `resolvedBy` (458), `decisions[].decidedBy[]` (490). Trend (591), cột Credits (7597, 7736), drill-down (7748) cũng theo chuỗi thô. **Activity log không phải nguyên nhân** (dashboard không đọc log).
- **Email vào dữ liệu từ:** (a) import Excel `pic` nguyên chuỗi (1555); (b) dữ liệu lưu trước Members 1.2 (`45f82cf`, `1951eb0`); (c) "Use as free text" trong PicEditor (2697); (d) các `<select>` PIC của action (8611), mitigation (8824), subtask (4590), RAID/My Work (10015, 10957) và `addContributor` (2493–2501) **không** gọi `resolvePicValue`.
- **Roster tự nhân bản email:** `deriveTeamMembers` (1427–1431) thêm giá trị quan sát được dạng `add(name)` không kèm email → `"hattt4@smartosc.com"` thành một "thành viên" riêng, xuất hiện trong mọi picker → bản ghi mới tiếp tục nhận email.
- **`resolvePicValue` (1247) chỉ biết email có trong roster**, mà roster thiếu danh bạ vì shim bỏ `memberIds` (187–190). Chỉ gọi ở 3 chỗ: PicEditor (2650), DecidedByPicker (3803), PicPicker (9243).
- **Cùng lỗi:** Team Overview (`computeTeamOverview` 8938, `getLastActivityForMember` 8919–8929) và Credit (`computeProjectCredits` 733, `getEffectiveCreditShares` 688–703).
- **Panel Members 1.3** phủ đủ trường nhưng chỉ trong project hiện tại, phân loại dựa trên `project.teamMembers` (không có danh bạ), không phủ khóa `creditShares`.
- **Hệ quả cho thiết kế:** củng cố P1 (khóa người theo email). Trước P1 có thể vá nhẹ: chuẩn hóa khi đọc (`canonicalPerson()` dùng danh bạ, gọi trong `ensure()`, credit `perPic`, Team Overview) + sửa `deriveTeamMembers` gộp email vào tên. Chưa đưa vào phạm vi B — chờ HOD quyết.
