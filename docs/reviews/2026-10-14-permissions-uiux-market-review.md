# AF-MPT — Rà soát phân quyền, UI/UX, so sánh thị trường và hướng mở rộng nhiều phòng ban

*14/10/2026 · Người đọc: HOD AF · Căn cứ:*
- *Code tại `8971f1a`, đọc trực tiếp, chưa test được luồng sau đăng nhập.*
- *Spec v2 `docs/superpowers/specs/2026-10-14-roles-permissions-v2-design.md`.*
- *Tài liệu chính thức của các app trên thị trường, tra tháng 10/2026; nguồn ở cuối file.*

---

## 0. Kết luận nhanh

1. **Hướng phân quyền đã đúng chuẩn.**
   - Chặn ở server bằng rules.
   - Vai trò gắn theo phạm vi (program/workstream).
   - Duyệt Done kiểu maker–checker.
   - Log chỉ được thêm, không sửa.

   Các app lớn cũng đi theo đúng mô hình này. **Cần sửa 6 điểm** trước khi viết plan P1–P2 (mục 1.2). Nặng nhất là ba điểm:
   - **Định danh nên theo `uid`**, không phải email.
   - **Phải có ≥2 Owner.**
   - **Phải có project "hạn chế"** cho các dự án nhạy cảm (MA, UBO).
2. **UI/UX: lỗi nghiêm trọng nhất là về niềm tin, không phải giao diện.**
   - Người không có quyền vẫn thấy đầy đủ nút sửa.
   - Họ sửa xong thì lưu thất bại mà không có thông báo, tải lại trang là mất.
   - My Work so tên chính xác từng ký tự, nên có người không thấy việc của mình.

   Vì vậy phải làm **B2 → P1 trước**, rồi mới làm lại giao diện theo vai trò (P4).
3. **Mở rộng nhiều phòng ban:** chi phí để chuẩn bị gần như bằng 0 **nếu làm ngay trong P2**:
   - tham số hóa `workspaceId`;
   - lưu danh sách thành viên và vai trò theo từng workspace;
   - đưa cấu hình riêng của phòng AF ra khỏi code.

   Nếu để sau, sẽ phải chuyển đổi dữ liệu thêm một lần nữa. Code hiện chỉ gắn cứng `'main'` ở 3 file cộng 4 chỗ trong rules, nên làm lúc này rất rẻ.
4. **Build hay mua:** với 10–50 người và lõi là duyệt việc, credit, RAID thì **tiếp tục tự build là hợp lý**. Cần xem lại khi có từ 3 phòng ban trở lên, hoặc khi cần SSO/audit đạt chuẩn (mục 5).

---

## 1. Phân quyền: đề xuất hiện tại so với best practice

### 1.1 Những gì đã đúng (giữ nguyên)

| Đề xuất | Chuẩn tương ứng | Ghi chú |
|---|---|---|
| Rules ở server là nơi chặn thật, UI chỉ ẩn/khóa | OWASP: kiểm tra quyền truy cập ở server | Hiện app vi phạm điều này. B1/P2 sửa đúng chỗ |
| Vai trò theo phạm vi (Owner → PM program → Sub-PM WS → Assignee) | Asana/Jira/ClickUp đều có 2 lớp: vai trò workspace + vai trò project/space | Đúng mô hình "workspace role + scoped role" |
| Assignee chỉ sửa vài trường của task mình, không tự đặt Completed | Least privilege; separation of duties | Thị trường ít app ép được điều này. Đây là điểm mạnh riêng vì dùng cho đánh giá performance |
| Duyệt Done một cấp; từ chối thì task **quay về InProgress** | Wrike/Jira: duyệt là một bước chuyển trạng thái. Asana bị chê vì "Reject cũng đóng task" | Spec đã tránh được lỗi của Asana |
| Credit chỉ ghi khi đã duyệt | Maker–checker cho dữ liệu dùng để đánh giá | Giữ |
| Activity log chỉ create, không update/delete | Audit log append-only (mọi app enterprise) | Giữ |
| Rules nằm trong repo + test emulator | "Policy as code" | Giữ |
| B1 khóa `workspaceOwner*` | Chặn tự leo thang quyền | Đúng việc cần làm đầu tiên |

### 1.2 Cần sửa hoặc bổ sung (khuyến nghị)

| # | Vấn đề | Chuẩn thị trường | Khuyến nghị | Đổi ở đâu |
|---|---|---|---|---|
| **S1** | **Định danh bằng email.** Spec v2 lưu mọi trường người bằng email chữ thường. Email có thể đổi (đổi tên, alias), và email làm khóa/doc ID là điều các app đều tránh. | Mọi app khóa user bằng **ID bất biến**; email chỉ là thuộc tính đăng nhập; tắt user chứ không xóa | Khóa bằng **Firebase `uid`**: `members/{uid}` gồm `{email, displayName, aliases[], status}`; task lưu `picUid`. Email chỉ dùng để nhập Excel và hiển thị. Người chưa đăng nhập lần nào thì tạo `invites/{email}`, gắn uid ở lần đăng nhập đầu. **Lý do làm ngay:** rules so `request.auth.uid` vừa rẻ vừa không đổi; đổi khóa sau P2 là chuyển dữ liệu lần hai. | Spec v2 §3, §7; P1 |
| **S2** | **Chỉ có 1 Owner** là điểm hỏng duy nhất. Nếu bị khóa tài khoản, nghỉ phép hoặc lỡ bấm Release thì không ai duyệt được và không ai đổi được hạn. | Asana, Monday, Jira, Linear cho nhiều admin/owner. ClickUp chỉ có 1 owner nên phải làm thêm màn "Danger zone" để chuyển quyền | Workspace có **`ownerUids[]` tối thiểu 2 người** (HOD + 1 người dự phòng, ví dụ Kế toán trưởng). Rules: không cho xóa owner cuối cùng. **B1:** ẩn nút Release, Transfer lưu email (sau P1 là uid). Ghi quy trình khẩn cấp bằng script Admin SDK vào CLAUDE.md. | B1 + P2 |
| **S3** | **Viewer xem được mọi thứ** (giả định A1). Trong khi đó có các project như **MA Project, UBO Wealth Restructuring** nghe là thông tin hạn chế. | Mọi app có project **public-to-team / private-to-members** | Mỗi project có trường **`visibility: 'department' \| 'restricted'`**. Restricted nghĩa là chỉ người được gán (PM/Sub-PM/Assignee/Viewer được mời) cùng Owner mới đọc được. **HOD chốt project nào là restricted.** | Sửa A1; spec §3, §8 |
| **S4** | **Người duyệt vắng mặt** thì việc bị kẹt, nhưng spec chưa xử lý. | Không app nào tự ủy quyền; cách phổ biến là admin đổi người duyệt và hệ thống ghi log | (a) Owner/PM **chuyển người duyệt** cho request đang chờ, có ghi log. (b) Request chờ quá **3 ngày làm việc** thì hiện ở Approvals của cấp trên. (c) Rules cấm **người duyệt trùng người gửi**. | Spec §5; P3 |
| **S5** | **Ma sát duyệt** với nhóm 15 người: duyệt mọi Done có thể làm mọi người ngừng cập nhật. | Hầu hết app nhóm nhỏ (Linear, Asana thường, ClickUp) không bắt duyệt mặc định; duyệt là tùy chọn theo project hoặc loại việc | Thêm cài đặt theo project **`requireCloseApproval`**: bật cho các project dùng chấm performance (AF 2026 KR, Operation), tắt cho project tham khảo. Giữ quyết định "duyệt 1 cấp", chỉ cho phép bật/tắt. | Spec §4–5; P3 |
| **S6** | **"View as" hiện vẫn ghi được dữ liệu** (dán nhãn "acting as X"). Sau P2 lệnh ghi thực chất là của Owner, nên làm lẫn lộn dữ liệu performance. | Impersonation chuẩn là chỉ đọc, hoặc có audit riêng | **View as chỉ đọc.** | P4 (sớm hơn nếu dễ) |
| S7 | Thành viên nghỉ việc: spec có `active` nhưng rules mẫu chưa kiểm tra. | Deactivate, giữ lịch sử | Rules: `status == 'active'` mới được ghi. Màn "chuyển việc của người nghỉ" cho Owner/PM. | Spec §8; P2 |
| S8 | Restore JSON toàn workspace từ trình duyệt; nút đang **hiện cho mọi người**. | Chỉ admin; khôi phục qua công cụ quản trị | Ẩn với người không phải Owner ngay ở B4. Sau P2 bỏ hẳn restore từ client, chỉ dùng script. | B4, P2 |
| S9 | Log hoạt động và duyệt chưa ghi đủ "giá trị trước/sau". | Mỗi quyết định duyệt lưu: ai, lúc nào, cũ → mới, ghi chú | Mỗi bản ghi `approvals` và `activity` có `before`/`after`. | Spec §5, §7 |

**Đề xuất B1 (cập nhật sau rà soát):**
- Giữ nội dung cũ: khóa trường owner trong rules, bỏ khớp theo tên, Transfer lưu email.
- Thêm: **ẩn Release**.
- Thêm: **ẩn "Become owner"** khi đã có owner.
- Danh sách nhiều owner để sang P2 (cần đổi dữ liệu).

---

## 2. So sánh thị trường (rút gọn)

| Khía cạnh | Thị trường làm gì | AF-MPT hiện tại | AF-MPT sau v2 + khuyến nghị |
|---|---|---|---|
| Phân cấp | Org → Workspace → Team/Space → Project → Task (Asana, ClickUp, Monday, Jira, Linear, Notion) | 1 workspace cứng `main` → Project → Program → WS → Task | Workspace có tham số; Project → Program → WS → Task |
| 1 user nhiều workspace | Có, kèm bộ chuyển workspace | Không | Chuẩn bị dữ liệu ở P2; giao diện chuyển workspace làm sau |
| Vai trò | Vai trò workspace (Owner/Admin, Member, Guest/Viewer) + vai trò project (Admin, Editor, Commenter, Viewer); quyền = lớn nhất của hai lớp | 2 hệ rời nhau; UI không đọc role | Owner/Admin ở workspace; PM/Sub-PM/Assignee/Viewer theo phạm vi |
| Project riêng tư | Có ở mọi app | Có ở mức rules (memberIds) nhưng UI không hiểu | `visibility` theo project (S3) |
| Nhiều owner | Có (trừ ClickUp) | 1 | ≥2 (S2) |
| Duyệt | Native ở Asana (gói Advanced), Wrike, Jira WM Premium, Smartsheet; tự dựng ở Monday/ClickUp; Linear/Notion/Basecamp không có. **Không app nào có sẵn "duyệt đổi deadline".** | Duyệt deadline task và RAID, rời rạc | Hộp duyệt chung; đây là **điểm khác biệt** so với tool mua sẵn |
| Audit | Lịch sử theo item cho mọi người; audit admin chỉ ở gói Enterprise, giữ 30–180 ngày | Log 500 dòng, member ghi đè được | Append-only, không giới hạn số dòng |
| Định danh | ID bất biến; deactivate thay vì xóa; SSO/SCIM ở Enterprise | Chuỗi tên | uid (S1); Google sign-in là đủ |
| Một project, nhiều kiểu xem | Mọi app: List/Board/Timeline/Calendar là các view của một project | 3 tab rời (Mind map/Outline/Gantt) | 1 tab Plan + nút chuyển kiểu xem (P4) |
| My Tasks / Inbox | Mọi app | Có My Work (tốt) | Thêm Approvals cạnh My Work |
| Chi tiết task | Panel bên phải → mở rộng → toàn trang (Notion, Asana, ClickUp, Jira, Linear) | Panel cố định 400px | Kéo rộng + mở rộng (B4) |
| Nhập hàng loạt | Có bước map cột + xem trước; ít app có diff/merge | Ghi đè cả project | Theo phạm vi + bản so sánh + duyệt (vượt chuẩn) |

**Rút ra:** AF-MPT không nên cạnh tranh ở phần "quản lý task chung". Giá trị riêng của nó là **duyệt + credit + RAID + Weekly Briefing**, gắn với cách phòng AF chấm performance. Thiết kế nên dồn sức vào đó.

---

## 3. Audit UI/UX

### 3.1 Tổng quan hiện trạng (từ code)
- **Thanh đầu trang:**
  - Khoảng 30 điều khiển dồn trong một hàng tự xuống dòng.
  - **13 tab**, chữ 12px; nhiều tab dùng chung một icon.
  - Nút Restore JSON, Delete project và Import **hiện cho mọi người**.
- **Panel task** rộng cố định 400px. Ô update chỉ 3 dòng. Đóng panel khi đang sửa thì mất bản nháp mà không có cảnh báo.
- **Các job chính tốn nhiều click:**

  | Việc | Số click (tốt nhất) |
  |---|---|
  | HOD review tuần | ~13 click, qua 6 tab (duyệt nằm rải ở My Work, RAID, TaskDetail) |
  | Tạo action trong buổi họp | Phải thoát Meeting mode (chỉ đọc) |
  | Tìm task quá hạn của một workstream | Không có bộ lọc workstream |

- **Lỗi lệch giữa các màn:** Gantt tính task **Dropped là quá hạn**, còn phần còn lại của app thì không (`GanttView.tsx:707` so với `App.jsx:209`).
- **Trợ năng:**
  - 0 thuộc tính `aria-*`; Modal không đóng bằng Esc, không giữ focus.
  - Khoảng 360 chỗ chữ ≤11px.
  - Màu chữ phụ `#95938C` chỉ đạt **3,07:1** độ tương phản (chuẩn AA là 4,5:1); màu vàng cảnh báo cũng không đạt.
- **Không responsive:** không có media query nào, và `body` đặt `overflow:hidden`. Thực tế app chỉ dùng được trên desktop.
- **Ngôn ngữ:** UI **100% tiếng Anh**, trong khi spec v2 dùng nhãn tiếng Việt ("Chờ duyệt", "Đề xuất hoàn thành"). Cần chốt trước khi làm mockup.
- **Thuật ngữ lệch nhau:**
  - Task dùng "Completed", action dùng "Done".
  - Role `member` hiển thị là "Viewer".
  - "Owner" vừa là owner workspace, vừa là owner project.

### 3.2 Danh sách ưu tiên

| # | Mức | Vấn đề | Sửa nhỏ (không refactor App.jsx) | Pha |
|---|---|---|---|---|
| 1 | P0 | Người không có quyền vẫn thấy nút sửa; lưu thất bại không có thông báo | Shim ném lỗi → toast lỗi giữ nguyên + chip "Chưa lưu"; sau đó ẩn nút theo quyền | **B2** → P4 |
| 2 | P0 | Panel task 400px, ô update 3 dòng | Kéo rộng 360–900px, nhớ độ rộng; nút ⤢ mở dạng modal ~1000px; ô update tự giãn; cảnh báo khi đóng lúc đang sửa | **B4** |
| 3 | P0 | My Work so tên chính xác từng ký tự, nên có người không thấy việc của mình | Chuẩn hóa người (email/alias → 1 người); làm triệt để ở P1 | P1 |
| 4 | P0 | Restore, Delete project, Import hiện cho mọi người; xóa task là xóa cứng | Chỉ Owner thấy; "Xóa task" đổi thành "Đánh dấu Dropped" | **B4** |
| 5 | P1 | 13 tab, Plan bị tách thành 3; Aggregation trùng với chế độ All-projects | Gộp thành 1 tab Plan; bỏ tab Aggregation; thứ tự tab theo vai trò | P4 |
| 6 | P1 | Chưa có hộp duyệt chung | Tab Approvals: gom yêu cầu dời deadline + RAID chờ duyệt ngay từ dữ liệu hiện có | P4 (sớm), P3 (loại mới) |
| 7 | P1 | Owner chưa chọn được Portfolio làm trang mở đầu; bấm heatmap không chuyển sang project | Thêm Portfolio/RAID/Actions vào `DEFAULT_VIEW_OPTIONS`; bấm thì mở Dashboard của project đó | P4 (nhỏ, làm sớm được) |
| 8 | P1 | Không lọc được theo workstream / quá hạn / PIC; Gantt tính quá hạn sai | FOCUS thêm cấp workstream; nút "Chỉ quá hạn"; sửa 1 dòng `isOverdue` của Gantt | B (1 dòng) + P4 |
| 9 | P1 | Nút ✓ đóng task bằng 1 click, không hoàn tác | Toast "Hoàn tác" 5 giây; P3 đổi thành "Đề xuất hoàn thành" | B4 → P3 |
| 10 | P1 | Meeting mode chỉ đọc | Nút "+ Action" trong Meeting mode, mở form có sẵn | P4 |
| 11 | P1 | Độ tương phản dưới chuẩn AA ở chữ 10–11px | Chỉ đổi giá trị token màu; cỡ chữ tối thiểu 11px | **B4** (chỉ đổi token) |
| 12 | P2 | Modal không đóng bằng Esc, không giữ focus, không có aria | Thêm vào component `Modal`/`Btn` dùng chung | B4 |
| 13 | P2 | Load project tuần tự; chunk JS 1 MB; màn chờ chỉ có chữ | `Promise.all`; lazy-load Gantt/Credit/Team/Briefing | PR nhỏ riêng |
| 14 | P2 | Thuật ngữ và ngôn ngữ lệch nhau | 1 bảng thuật ngữ; **chốt nhãn VI hay EN** | P4 |
| 15 | P2 | Token màu bị chép ở 5 file | `src/tokens.ts` dùng chung | P4 |
| 16 | P2 | Không responsive | Ghi rõ "desktop-only"; dưới 1100px gom tab vào menu | P4 |

### 3.3 Điều hướng đích theo vai trò

Tab không có quyền thì **ẩn hẳn**, không chỉ làm mờ. Menu "⋯" chứa Excel, Minutes, Backup, Import, và Restore (chỉ Owner).

| Vai trò | Màn mở đầu | Tab (theo thứ tự) |
|---|---|---|
| Owner (HOD) | Portfolio + badge số việc chờ duyệt | Portfolio · Approvals · Plan · My Work · Actions · Decisions · RAID · Activity · Team · Credits |
| PM | Plan, lọc sẵn program của mình | Plan · My Work · Approvals (program) · Actions · Decisions · RAID · Dashboard |
| Sub-PM | Plan, lọc sẵn workstream, bật "Chỉ quá hạn" | Plan · My Work · Approvals (WS) · Actions · RAID |
| Assignee | My Work | My Work · Plan (chỉ đọc ngoài việc của mình) · Actions |
| Viewer | Plan (chỉ đọc) | Plan · Dashboard · Decisions, kèm chip "Chỉ xem" |

---

## 4. Mở rộng nhiều phòng ban / nhiều workspace: làm gì bây giờ để sau không phải sửa nhiều

### 4.1 Mô hình đích (chuẩn chung của thị trường)

```
orgs/smartosc                                   (tùy chọn; 1 doc mặc định)
workspaces/{wsId}                               { orgId, name, ownerUids[], config{…} }
workspaces/{wsId}/members/{uid}                 { email, displayName, aliases[], wsRole: owner|admin|member, status }
workspaces/{wsId}/invites/{email}               (người chưa đăng nhập lần nào)
workspaces/{wsId}/projects/{pid}                { visibility, requireCloseApproval, programs{…pmUid…} }
workspaces/{wsId}/projects/{pid}/workstreams/…  { leadUid, … }
workspaces/{wsId}/projects/{pid}/tasks/…        { picUid, contributorUids[], … }
workspaces/{wsId}/projects/{pid}/approvals/…    { before, after, approverUid, … }
workspaces/{wsId}/projects/{pid}/activity/…     (chỉ create)
users/{uid}                                     { email, displayName, workspaceIds[] }   ← để chuyển workspace
```

**Khác với spec v2 ở 4 điểm:**
1. Khóa người theo `uid`.
2. `ownerUids[]` thay cho một owner.
3. Thêm `visibility` và `requireCloseApproval` theo project.
4. Rules viết `match /workspaces/{wsId}/…` với `wsId` là biến, **không viết chữ `'main'`**.

My Work cần lấy việc trên nhiều project. Có thể dùng **collection-group query** (`tasks` where `picUid == me`, lọc theo `workspaceId`), nên **mỗi task cần thêm trường `workspaceId` và `projectId`**, dù đã có trong đường dẫn.

### 4.2 Việc nên làm ngay trong P2 (gần như không tốn thêm)

| # | Việc | Vì sao rẻ bây giờ |
|---|---|---|
| W1 | Mọi đường dẫn và rules dùng `wsId` là biến. Code lấy `wsId` từ một chỗ duy nhất (hiện là hằng số `'main'` ở `storage-shim.ts:37`, `data.ts:29`, `scripts/migrate.js:54`) | P2 viết lại rules và adapter đằng nào cũng làm |
| W2 | Vai trò và thành viên nằm ở `workspaces/{wsId}/members`, **không** đặt ở `users/{uid}` | Một người có thể là Owner ở AF nhưng Viewer ở phòng khác |
| W3 | Mỗi document con có `workspaceId` + `projectId` | Phục vụ query xuyên project/workspace sau này |
| W4 | Cấu hình riêng của AF chuyển vào `workspaces/{wsId}.config`: danh sách phòng ban mặc định, quy tắc credit (70/30), nhãn/thuật ngữ, màn mở đầu mặc định, webhook | Phòng khác dùng quy tắc khác mà không phải sửa code |
| W5 | Bỏ các thứ gắn cứng: domain trong rules (7 chỗ `smartosc`) chuyển thành kiểm tra "là thành viên workspace"; URL deep link (4 chỗ) dùng `window.location.origin`; dữ liệu mẫu `SEED_CRP` chỉ chạy khi tạo workspace demo | Mỗi chỗ chỉ sửa vài dòng |
| W6 | Giữ `'main'` làm `wsId` của AF | Không phải đổi đường dẫn dữ liệu cũ, chỉ thêm |

### 4.3 Để sau, chỉ làm khi có phòng thứ hai
- Giao diện chuyển workspace và tạo workspace. Ban đầu tạo bằng script admin là đủ.
- Vai trò cấp tổ chức (`orgAdmins`) cho CFO/COO, chỉ đọc xuyên các workspace.
- Portfolio xuyên phòng ban: cần Cloud Functions tổng hợp định kỳ, tức là gói **Blaze**.
- Thông báo, digest và credit tính ở server bằng Cloud Functions.

### 4.4 Những sai lầm cần tránh (đúc kết từ thị trường)
- Collection toàn cục không có `workspaceId`.
- Vai trò lưu một trường duy nhất trên user.
- Email làm khóa.
- Xóa cứng user hoặc task.
- Chỉ có 1 owner.
- Log sửa được.
- Trạng thái duyệt chỉ nằm trong `status` của task, không có bản ghi request riêng.

---

## 5. Build hay mua: tín hiệu cần theo dõi

| Tiếp tục tự build khi… | Cân nhắc chuyển (ứng viên đầu: **OpenProject**, công ty đã có) khi… |
|---|---|
| Giá trị lõi là duyệt + credit performance + RAID + Briefing mà tool mua sẵn chỉ làm gần đúng (duyệt native chỉ có ở gói cao) | Nhu cầu trôi dần về quản lý task chung (time tracking, resource, mobile app, tích hợp) |
| 10–50 người, 1–2 phòng | Từ 3 phòng trở lên, cần SSO/SCIM, audit có thời hạn lưu trữ, guest ngoài công ty |
| Có người chịu trách nhiệm bảo trì | Bus factor = 1 mà không ai tiếp quản |
| Dữ liệu cần nằm trong GCP của công ty | Kiểm toán yêu cầu chứng chỉ (SOC 2/ISO) cho chính công cụ |

**Phương án trung gian (ghi nhận, chưa đề xuất làm):** giữ AF-MPT cho lớp duyệt, credit và RAID; task chi tiết đồng bộ một chiều từ OpenProject qua API. CLAUDE.md hiện cấm đồng bộ hai chiều; nếu một chiều thì cần HOD quyết.

---

## 6. Đề xuất điều chỉnh lộ trình

| Pha | Nội dung cũ | Điều chỉnh |
|---|---|---|
| B1 | Khóa trường owner trong rules | + ẩn Release / "Become owner" khi đã có owner |
| B2 | Báo lỗi khi lưu | + chặn reset danh sách thành viên khi `getDoc` lỗi; toast lỗi giữ nguyên + chip "Chưa lưu" |
| B4 | Panel task kéo rộng | + ẩn Restore/Delete project/Import với người không phải Owner; Dropped thay xóa cứng; Undo cho ✓; đổi token màu cho đạt AA; Esc/focus cho Modal; sửa `isOverdue` của Gantt |
| P1 | Danh bạ theo email | **Khóa theo uid** (+ invites theo email); người dự phòng thành Owner thứ 2 |
| P2 | Tách document + rules | + `wsId` là biến, `workspaceId` trên mọi doc, cấu hình AF vào `config`, `visibility`, `ownerUids[]`, rules kiểm `status == active`, cấm tự duyệt |
| P3 | Approvals | + đổi người duyệt, đẩy lên cấp trên sau 3 ngày, `requireCloseApproval` theo project, lưu `before/after` |
| P4 | UI theo vai trò | + View as chỉ đọc; chốt ngôn ngữ nhãn; `tokens.ts` |

### Quyết định HOD đã chốt (14/10/2026)
| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Định danh (S1) | **uid** (+ `invites/{email}` cho người chưa đăng nhập) |
| 2 | Owner thứ 2 (S2) | **Chưa có, để sau.** Vẫn thiết kế `ownerUids[]`; B1 ẩn Release |
| 3 | Project restricted (S3) | **Mặc định `restricted`** cho project mới (chỉ thành viên dự án + Owner). Owner đổi sang `department` trong Project Settings, có ghi log, vì dự án nhạy cảm thay đổi theo từng năm |
| 4 | Duyệt Done/Dropped (S5) | **Tất cả project** (không có cờ bật/tắt) |
| 5 | Ngôn ngữ nhãn | **Tiếng Anh**, thuật ngữ chuẩn |
| 6 | Đa workspace | **Làm ngay trong P2** |
| 7 | Chạy test rules | **GitHub Actions** |

Đã cập nhật vào spec v2 §2.1, `docs/DESIGN.md` §3 và `CLAUDE.md` Key Decisions.

---

## Nguồn (tài liệu chính thức, tra 10/2026)
- **Asana:** [approvals](https://help.asana.com/s/article/approvals) · [admin roles](https://help.asana.com/s/article/admin-and-super-admin-roles-in-asana) · [project permissions](https://help.asana.com/s/article/individual-project-permissions) · [workspaces & orgs](https://help.asana.com/s/article/workspaces-and-organizations-faq) · [audit log](https://developers.asana.com/docs/audit-log-events)
- **ClickUp:** [transfer ownership](https://help.clickup.com/hc/en-us/articles/6310482663063-Transfer-Workspace-ownership) · [guests](https://help.clickup.com/hc/en-us/articles/6311803642903-Use-ClickUp-as-a-guest) · [audit logs](https://help.clickup.com/hc/en-us/articles/25324213764119-Audit-Logs-feature-availability-and-limits)
- **Monday:** [user types](https://support.monday.com/hc/en-us/articles/360002144900) · [audit log](https://support.monday.com/hc/en-us/articles/360001259429-The-Audit-Log)
- **Jira:** [team-managed access](https://support.atlassian.com/jira-software-cloud/docs/manage-how-people-access-your-team-managed-project) · [approvals](https://support.atlassian.com/jira-software-cloud/docs/set-up-approvals-in-your-business-project/) · [audit log](https://support.atlassian.com/security-and-access-policies/docs/view-audit-log-activities/)
- **Linear:** [members & roles](https://linear.app/docs/members-roles) · [audit log](https://linear.app/docs/audit-log)
- **Notion:** [who's who](https://www.notion.com/en-gb/help/whos-who-in-a-workspace) · [audit log](https://www.notion.com/en-us/help/audit-log)
- **Wrike:** [approvals](https://help.wrike.com/hc/en-us/articles/210325065) · [user types](https://help.wrike.com/hc/en-us/articles/4410034413079)
- **Smartsheet:** [permission levels](https://help.smartsheet.com/articles/1155182-sharing-permission-levels) · [approvals](https://help.smartsheet.com/articles/2479276-request-approval-from-stakeholders)
- **OpenProject:** [roles & permissions](https://www.openproject.org/docs/system-admin-guide/users-permissions/roles-permissions/)
- **Firebase:** [rules & auth (role docs vs custom claims)](https://firebase.google.com/docs/rules/rules-and-auth)

*Chưa xác minh trong tài liệu chính thức:* duyệt native của Monday/ClickUp (chỉ thấy hướng dẫn của bên thứ ba); thời hạn lưu audit của Notion; ủy quyền duyệt tự động ở bất kỳ app nào.
