# AF-MPT — Roles & Permissions v2 (design spec)

*Ngày: 14/10/2026 · Trạng thái: **DRAFT chờ HOD duyệt** · Đề xuất lưu tại `docs/superpowers/specs/2026-10-14-roles-permissions-v2-design.md`*
*Căn cứ: `HANDOVER_AFMPT_2026-10-14.md`, `AUDIT_APPENDIX_2026-10-14.md` (commit `8971f1a`), 5 điểm chưa ưng của HOD, 4 quyết định chốt ngày 14/10.*

> **Độ tin cậy:** các trích dẫn code đã được đối chiếu trên repo ngày 14/10 (Claude Code, HEAD `8971f1a`), kết quả chi tiết ở `docs/DESIGN.md` mục 6. Còn chưa kiểm: gói Firebase/PITR và kích thước doc CRP (cần console).

---

## 1. Vấn đề cần giải

| # | Điểm chưa ưng (HOD) | Gốc kỹ thuật |
|---|---|---|
| 1 | PIC gắn theo task, trong khi thực tế trách nhiệm gắn theo Program (PM) và Workstream (Sub-PM). Cần PM/Sub-PM được cập nhật, deadline lớn do Owner duyệt, Done có duyệt. | Program `{id,name,raid,workstreams}` và Workstream `{id,name,tasks}` không có trường người phụ trách. Role chỉ có ở cấp project (owner/operator/member). |
| 2 | UI rối (Mind map/Outline/Gantt 3 tab), view theo vai trò chưa được thiết kế. | ~15 tab hiện cùng lúc cho mọi người; UI không đọc role. |
| 3 | Một người xuất hiện nhiều tên ("Hà Trương Thị Thu", "hattt4@smartosc.com", "hattt4"). Credit bị chia mảnh. | Định danh bằng chuỗi tên hiển thị. Merge chỉ sửa hậu quả. |
| 4 | Panel task bên phải không kéo rộng / không mở pop-up. | Chỉ UI. |
| 5 | Upload plan chỉ được cả project; muốn PM/Sub-PM upload theo phạm vi, Owner duyệt rồi mới ghi. | Import ghi đè cả cây project trong 1 document. |

**Giới hạn quyết định thiết kế:** cả project nằm trong 1 document Firestore. Rules **không duyệt được phần tử trong mảng**, nên không thể kiểm "Sub-PM A chỉ sửa task thuộc workstream A". Muốn phân quyền có hiệu lực ở server thì đơn vị được phân quyền (workstream, task) phải là document riêng.

## 2. Quyết định đã chốt (14/10/2026)

1. **Phạm vi:** mở rộng đợt này = vá an toàn + thiết kế lại phân quyền và định danh. Vượt ràng buộc "không thêm tính năng" ban đầu, có chủ đích.
2. **Thực thi ở server:** tách workstream và task thành document riêng; Firestore rules là nơi chặn thật. Giao diện chỉ ẩn/khóa cho đỡ nhầm.
3. **Duyệt Done 1 cấp:** quản lý trực tiếp duyệt; Owner có quyền ghi đè. Action do PIC tự đóng, không duyệt.
4. **Sửa plan lẻ không cần duyệt** nếu nằm trong hạn workstream. Chỉ **upload hàng loạt** và **đổi hạn workstream/program/project** cần Owner duyệt.

**Giả định tạm (HOD sửa nếu sai):**
- A1. Cả phòng (Viewer) xem được mọi program; riêng Credit, Team, Activity Dashboard chỉ Owner và PM (PM chỉ thấy người trong program mình).
- A2. Mỗi program có 1 PM, tùy chọn 1 Deputy PM cùng quyền.
- A3. Mỗi workstream có 1 Sub-PM (lead). Có thể để trống, khi đó PM đảm nhận.
- A4. Dropped được xử lý như Done: người được giao đề xuất, quản lý trực tiếp duyệt.

## 3. Vai trò

| Vai trò | Gắn ở đâu | Ví dụ |
|---|---|---|
| **Owner** | `workspaces/main.workspaceOwnerEmail` (1 người) | HOD |
| **PM** / Deputy PM | `program.pmEmail`, `program.deputyEmail` | PM của "LLCs" trong CRP |
| **Sub-PM** | `workstream.leadEmail` | Control tower / OP lead phụ trách 1 KRA |
| **Assignee** | `task.picEmail`, `task.contributorEmails[]`; `action.picEmail` | Người làm task/action |
| **Viewer** | Mọi user `@smartosc.com` có trong danh bạ `members` (active) | Cả phòng |

Một người có thể giữ nhiều vai trò ở các nơi khác nhau. Quyền = hợp của các vai trò tại phạm vi đang xét. Role cũ owner/operator/member theo project **thôi dùng** sau chuyển đổi (xem §8).

**Định danh:** mọi trường người đều lưu **email chữ thường**. Tên hiển thị lấy từ danh bạ `members/{email}` lúc render. Đây là Members Phase 2 trong audit, nay là điều kiện tiên quyết vì rules so sánh bằng `request.auth.token.email`.

## 4. Ma trận quyền

"WS" = workstream. "Trong hạn WS" = `task.end ≤ workstream.end` và `task.start ≥ workstream.start`.

| Việc | Owner | PM (program mình) | Sub-PM (WS mình) | Assignee (việc mình) | Viewer |
|---|---|---|---|---|---|
| Tạo/xóa/đổi tên project, program; gán PM | ✓ | – | – | – | – |
| Tạo/xóa workstream, gán Sub-PM | ✓ | ✓ | – | – | – |
| Tạo/sửa/xóa task, giao người | ✓ | ✓ | ✓ trong hạn WS | – | – |
| Đổi hạn task | ✓ | ✓ trong hạn WS | ✓ trong hạn WS | xin đổi → Sub-PM | – |
| Đổi hạn WS / program / project | ✓ | xin đổi → Owner | xin đổi → Owner | – | – |
| Cập nhật status (Planned/InProgress), health, update/comment | ✓ | ✓ | ✓ | ✓ | comment |
| Đề xuất Done/Dropped (→ `Submitted`) | – | ✓ | ✓ | ✓ | – |
| Duyệt Done/Dropped | ✓ ghi đè mọi nơi | task của Sub-PM trong program | task của Assignee trong WS | – | – |
| Upload plan hàng loạt | ✓ áp thẳng | tạo đề xuất (program) → Owner | tạo đề xuất (WS) → Owner | – | – |
| Action: tạo | ✓ | ✓ | ✓ | – | – |
| Action: cập nhật, đóng Done | ✓ | ✓ | ✓ | ✓ action của mình | – |
| Decision, RAID của program | ✓ | ✓ | tạo/đề xuất | – | xem |
| Duyệt RAID (Draft → Active) | ✓ | ✓ | – | – | – |
| Credit, Team, Activity Dashboard, View as | ✓ | xem trong program | – | – | – |
| Portfolio, Weekly Briefing | ✓ | ✓ | ✓ | ✓ | ✓ xem |
| Project settings, webhook, members | ✓ | – | – | – | – |

**Quy tắc duyệt Done "quản lý trực tiếp":** Assignee → Sub-PM của WS. Nếu người đề xuất chính là Sub-PM (hoặc WS không có Sub-PM) → PM. Nếu người đề xuất là PM → Owner. Owner tự đóng việc của mình không cần duyệt.

## 5. Hộp duyệt (Approvals inbox)

Gộp các luồng duyệt rời nhau hiện có (đổi deadline task v27, RAID PendingApproval) và luồng mới vào **một** màn hình, thay cho nhiều badge rải rác.

| Loại | Người gửi | Người duyệt | Khi duyệt xong |
|---|---|---|---|
| `task_close` (Done/Dropped) | Assignee/Sub-PM/PM | quản lý trực tiếp (§4) | task → Completed/Dropped, ghi `closedBy`, `approvedBy` |
| `task_deadline` | Assignee | Sub-PM (nếu trong hạn WS), ngược lại Owner | đổi `task.end`, ghi `deadlineHistory` |
| `scope_deadline` (WS/program/project) | PM/Sub-PM | Owner | đổi hạn, ghi lịch sử |
| `plan_import` | PM/Sub-PM | Owner | áp bản so sánh vào phạm vi |
| `raid_activate` | Sub-PM/PM | PM/Owner | RAID → Active |

**Trạng thái:** `Pending → Approved | Rejected (bắt buộc lý do) | Withdrawn`. Không có `Draft` riêng; người gửi rút lại được khi còn Pending.

**Với task_close:** trong lúc chờ, task ở trạng thái mới **`Submitted`** (hiển thị "Chờ duyệt"). `Submitted` **không tính quá hạn** và **chưa tính credit** — credit chỉ ghi khi Approved. Bị từ chối → task trở về InProgress, kèm lý do trong updates.

**Xung đột:** mỗi request lưu `baseVersion` của các document bị ảnh hưởng. Khi duyệt, nếu version hiện tại khác → hiện "đã có thay đổi từ lúc gửi" kèm so sánh, Owner chọn áp tiếp hoặc trả về.

**Hiển thị:** tab "Approvals" có badge số chờ duyệt *của tôi*; mục "Đã gửi" cho người gửi theo dõi. Thông báo Google Chat cho request mới: **ngoài phạm vi đợt này** (giữ quyết định chỉ notify cho Action).

## 6. Upload plan theo phạm vi (điểm 5)

1. Người dùng chọn phạm vi trước khi upload: Project (chỉ Owner) / Program / Workstream — danh sách chỉ hiện phạm vi họ có quyền.
2. Đọc file Excel bằng importer hiện có (column aliases: `COL` `App.jsx:1469`, `parseExcelFile` 1523, `ImportModal` 14789 — đã kiểm). Lưu ý: importer hiện lấy `pic` nguyên chuỗi (1555), không qua `resolvePicValue` → phải thêm bước đổi về email ở đây. Dòng thuộc program/WS ngoài phạm vi bị loại, báo rõ số dòng và lý do. PIC không có trong danh bạ → chặn (không cho free text trong import).
3. Ghép với dữ liệu hiện tại theo **task id** (cột ẩn trong file export) rồi theo tên trong cùng WS. Ra bản so sánh: thêm / sửa (field nào) / xóa / đổi hạn / dòng không khớp.
4. Owner: xem bản so sánh rồi áp ngay. PM/Sub-PM: tạo `plan_import` request chứa bản so sánh; Owner duyệt mới ghi.
5. Áp bằng một `writeBatch` (tối đa 500 thao tác; WS lớn hơn thì chia batch, ghi rõ). Task bị "xóa" qua import chuyển **Dropped**, không xóa cứng.
6. Đổi hạn WS/program nằm trong file import → đi kèm cùng request, Owner duyệt một lần.

Hệ quả: quy trình "xuất Excel → sửa → upload lại" trở thành cách chuẩn để Sub-PM cập nhật plan hàng loạt, đồng thời là cách sao lưu.

## 7. Mô hình dữ liệu mới (Firestore)

```
workspaces/main                                  meta; thêm workspaceOwnerEmail
workspaces/main/members/{email}                  danh bạ chuẩn: displayName, aliases[], department, active
workspaces/main/projects/{pid}                   meta project + programs (MAP theo id, không phải mảng)
     programs: { [programId]: { name, order, pmEmail, deputyEmail, start, end, raid[] } }
     decisions[], relatedParties, credit settings ... (giữ như cũ)
workspaces/main/projects/{pid}/workstreams/{wsId}  { programId, name, order, leadEmail, start, end, version, updatedAt, updatedBy }
workspaces/main/projects/{pid}/tasks/{taskId}      { programId, workstreamId, ...các field task hiện tại,
                                                     picEmail, contributorEmails[], status (+ 'Submitted'),
                                                     version, updatedAt, updatedBy }
workspaces/main/projects/{pid}/actions/{actionId}  { ...field action hiện tại, picEmail, workstreamId?, version }
workspaces/main/projects/{pid}/approvals/{reqId}   { type, scope{programId,workstreamId,taskId}, requestedBy,
                                                     approverEmail, payload, baseVersions, status, decidedBy,
                                                     decidedAt, reason }
workspaces/main/projects/{pid}/activity/{autoId}   1 document / 1 sự kiện, chỉ thêm
workspaces/main/projects/{pid}/private/settings    googleChatWebhook (chỉ Owner + PM đọc)
```

**Vì sao `programs` là map:** rules không tìm được phần tử trong mảng theo id, nhưng đọc được `programs[ws.programId].pmEmail` qua `get()`.

**Vì sao task là document riêng (không chỉ workstream):** để rules phân biệt Assignee chỉ sửa task của mình, và chặn Assignee tự đặt `Completed`. Đồng thời xóa hẳn giới hạn 1 MiB và giảm gần hết ghi đè lẫn nhau (2 người sửa 2 task khác nhau không còn đụng nhau).

**Decisions và RAID** tạm giữ trong document project (ít, nhỏ). Quyền ghi: Owner + mọi PM/Sub-PM của project — chưa phân theo program ở server. Câu hỏi mở Q1.

**Adapter giữ nguyên hình dạng dữ liệu trong bộ nhớ (để không phải sửa App.jsx hàng loạt):**
- Load: đọc project doc + collection `workstreams` + `tasks` + `actions`, **ráp lại thành cây cũ** `programs[] → workstreams[] → tasks[]` mà App.jsx đang dùng.
- Save: so cây mới với bản đã load, **chỉ ghi document thay đổi** (task/WS/action), mỗi ghi kèm điều kiện `version` (transaction). Version lệch → báo "có người vừa sửa, tải lại".
- Lỗi rules → hiện thông báo theo từng mục bị từ chối (nối với vá B2).
- Phần đổi chính nằm ở `storage-shim.ts` (ghi project 294–302, nuốt lỗi 340–343, bỏ `memberIds/roles` khi đọc 187–190) + vài điểm gọi trong `App.jsx` (load 12365–12428, `persistProject` 12592–12596) — đã kiểm 14/10.
- Adapter **không được đoán** khi đọc lỗi: hiện shim coi `getDoc` lỗi là "doc chưa có" và reset ACL (`storage-shim.ts` 276–291). Adapter mới phải phân biệt `not-found` với lỗi khác.

## 8. Rules (phác thảo, viết thật trong plan)

```
function email() { return request.auth.token.email.lower(); }
function proj(pid) { return get(/databases/$(database)/documents/workspaces/main/projects/$(pid)).data; }
function ws(pid, wsId) { return get(/databases/$(database)/documents/workspaces/main/projects/$(pid)/workstreams/$(wsId)).data; }
function isOwner() { return email() == get(/databases/$(database)/documents/workspaces/main).data.workspaceOwnerEmail; }
function isPM(pid, prgId) { let p = proj(pid).programs[prgId]; return email() == p.pmEmail || email() == p.deputyEmail; }
function isLead(pid, wsId) { return email() == ws(pid, wsId).leadEmail; }

match /workspaces/main {
  allow read: if isDomainUser();
  allow update: if isOwner()
    || (isDomainUser() && !request.resource.data.diff(resource.data).affectedKeys()
          .hasAny(['workspaceOwnerEmail','workspaceOwner','ownershipLog','defaultView']));
  // first-claim (owner trống) chỉ qua script admin, không qua client
}

match /workspaces/main/projects/{pid}/tasks/{tid} {
  allow read: if isMember();
  allow create: if isOwner() || isPM(pid, request.resource.data.programId)
    || (isLead(pid, request.resource.data.workstreamId) && withinWs());
  allow delete: if isOwner() || isPM(pid, resource.data.programId);   // Sub-PM chuyển Dropped thay vì xóa
  allow update: if isOwner()
    || isPM(pid, resource.data.programId)                                    // trong hạn WS
    || (isLead(pid, resource.data.workstreamId) && withinWs() && !closingOwnTask())
    || (isAssignee() && onlyKeys(['status','health','healthNote','updates','updatedAt','updatedBy','version'])
        && request.resource.data.status in ['Planned','InProgress','Submitted']);
  // Completed/Dropped chỉ do người duyệt đúng cấp (§4) đặt, kèm approvals/{reqId} Approved
}

match /workspaces/main/projects/{pid}/activity/{eid} {
  allow read: if isMember();
  allow create: if isMember() && request.resource.data.author == email();
  allow update, delete: if false;
}
```

**Vận hành rules (thay cách dán tay hiện nay):** thêm `firebase.json` + `firestore.rules` trong repo, deploy bằng `firebase deploy --only firestore:rules`. Viết **test rules đầu tiên của dự án** bằng Firebase Emulator + `@firebase/rules-unit-testing`, mỗi dòng ma trận §4 ít nhất 1 test cho phép và 1 test từ chối. Đây là chỗ test đáng tiền nhất vì nó bảo vệ đúng thứ dễ hỏng nhất.

**Giới hạn đã biết:** mỗi lần kiểm rules tối đa 10 `get()`; thiết kế trên dùng 2–3. Lượt đọc tăng (mỗi task 1 lượt): ~260 task × ~10 người × vài lần mở/ngày ≈ vài nghìn lượt, trong hạn miễn phí 50.000/ngày. **Chưa rõ gói Firebase đang dùng** (Spark/Blaze) — HOD kiểm trên console (DESIGN 6.8).

## 9. Chuyển đổi dữ liệu (expand → switch → contract)

| Bước | Việc | Hoàn tác |
|---|---|---|
| M0 | Sao lưu: JSON + Excel từng project (HOD làm, 14/10) + export Firestore nếu có quyền gcloud | — |
| M1 | Dựng danh bạ `members/{email}`. Script quét mọi chuỗi người trong 7 project → **bảng ánh xạ tên → email** (Excel) → **HOD duyệt từng dòng** | Xóa collection `members` |
| M2 | Script chuyển đổi chạy **dry-run** trên file export: sinh workstreams/tasks/actions mới + báo cáo (đếm, task thiếu PIC, tên không ánh xạ được). HOD xem | Không ghi gì |
| M3 | HOD điền PM/Sub-PM cho từng program/WS (bảng Excel), bắt đầu với AF 2026 Key Results và AF 2026 Operation làm pilot | — |
| M4 | Chạy thật: ghi collection mới. **Document project cũ giữ nguyên** (đổi thành chỉ đọc), thêm `schemaVersion: 2` | Đặt lại `schemaVersion: 1`, app đọc đường cũ |
| M5 | Deploy app đọc/ghi đường mới + rules mới. Pilot 1–2 tuần với Owner + 2–3 Sub-PM | Revert deploy + rules cũ trong repo |
| M6 | Sau 2–4 tuần ổn định: bỏ đường đọc cũ, dọn field cũ (`pic` dạng tên, `roles`, `memberIds` cũ) | Từ đây mới không quay lại được → cần HOD duyệt |

Script chuyển đổi đặt trong `scripts/` (Admin SDK, như `migrate.js` hiện có), chạy được nhiều lần không hỏng ("nếu đã có thì bỏ qua").

## 10. Giao diện theo vai trò (điểm 2, 4 — chi tiết ở bước mockup)

- Gộp Mind map / Outline / Gantt thành **1 tab "Plan"** có nút chuyển kiểu xem.
- Thứ tự tab theo HOD: **Plan → My Work → Actions/Decisions/RAID → Portfolio/Dashboard → Briefing/Minutes/Credit**. Thêm **Approvals** cạnh My Work.
- Mặc định theo vai trò: Owner mở Portfolio + Approvals; PM mở Plan lọc program của mình; Sub-PM mở Plan lọc WS của mình; Assignee/Viewer mở My Work. Tab không có quyền thì ẩn, không chỉ khóa.
- Mind map và Outline hiện **PM ở node program, Sub-PM ở node workstream**; task không PIC được phép (mặc định thuộc Sub-PM).
- Panel task: kéo rộng được + nút mở toàn màn hình; ô update tự giãn. (Làm sớm như quick win B4.)
- Gộp hàng nút thứ hai (Minutes, Excel, tải, upload) vào menu "⋯ Xuất/Nhập".

## 11. Phân pha triển khai

| Pha | Nội dung | Điều kiện qua cổng |
|---|---|---|
| **B** (trên kiến trúc cũ) | B1 khóa `workspaceOwner` trong rules; B2 báo lỗi khi lưu thất bại; B3 cảnh báo khi lưu đè dữ liệu cũ (`updatedAt`); B4 panel task kéo rộng/pop-up | HOD xác nhận từng mục trên production |
| **P1** | Danh bạ email + ánh xạ tên (M1). Hết trùng tên | Activity Dashboard mỗi người 1 dòng |
| **P2** | Tách document + adapter + rules mới + test rules (M2–M5) | Test rules xanh; pilot không mất dữ liệu |
| **P3** | Approvals inbox + `Submitted` + upload theo phạm vi | Pilot duyệt được Done và 1 lần upload WS |
| **P4** | UI theo vai trò (sau mockup được duyệt) | HOD duyệt mockup trước khi code |
| **F** | Dọn task quá hạn: mỗi Sub-PM rà WS của mình qua Excel export → upload theo phạm vi → Owner duyệt | Tỷ lệ quá hạn phản ánh thực tế |

Không onboard cả phòng trước khi xong **B + P1 + P2**. P3 nên xong trước khi dùng số liệu cho đánh giá performance.

## 12. Câu hỏi mở

- **Q1.** Decisions/RAID có cần phân quyền theo program ở server (tách document tiếp) không, hay quyền "PM/Sub-PM bất kỳ trong project" là đủ?
- **Q2.** Webhook Google Chat: chấp nhận Assignee đọc được URL (vì trình duyệt của họ gửi thông báo), hay thêm 1 serverless function trên Vercel để giấu URL? Khuyến nghị: để sau P3.
- **Q3.** Task đang `Submitted` quá hạn thì Sub-PM có bị tính "chậm duyệt" trong Activity Dashboard không?
- **Q4.** Danh sách thành viên chuẩn: lấy từ đâu (HR, danh sách phòng) và ai được thêm người — chỉ Owner?
- **Q5.** Đặt tên project khớp nhãn `PJ/` bên PMO Tracker: thêm trường `pmoTag` cho project, áp ở P1.
- **Q6.** Định nghĩa "quá hạn": `end < hôm nay` và status ∈ {Planned, InProgress}; `Submitted`, `Completed`, `Dropped` không tính. HOD xác nhận.

## 13. Rủi ro của chính thiết kế này

| Rủi ro | Giảm thiểu |
|---|---|
| Adapter sai làm hỏng dữ liệu khi lưu | Document cũ giữ nguyên tới M6; dry-run; pilot trên 2 project AF 2026 trước CRP |
| Có chỗ ghi dữ liệu không qua shim — **đã kiểm:** MembersModal (`addProjectMember`, `setMemberRole`, `removeProjectMember`, `setRelatedParties` → `data.ts saveProject` `merge:false`); App.jsx thì chỉ ghi qua shim | Chuyển MembersModal về adapter trong P2 |
| Email lọt vào trường người qua đường không gọi `resolvePicValue` (import 1555; select PIC 4590, 8611, 8824; `addContributor` 2493) — xem DESIGN 6.1 | P1 phải phủ mọi đường ghi người, không chỉ 3 picker |
| Rules phức tạp, dễ sai | Test rules bắt buộc trước deploy; emulator |
| Ma sát duyệt làm mọi người ngừng cập nhật | Duyệt 1 cấp; sửa lẻ không duyệt; đo số request chờ > 3 ngày sau 2 tuần pilot |
| Một người bảo trì | Mỗi pha một PR nhỏ, có cách hoàn tác ghi trong PR |
