# AF-MPT — Product Spec

*Cập nhật: 14/10/2026 · Chủ sở hữu: HOD AF · Chi tiết phân quyền: `docs/superpowers/specs/2026-10-14-roles-permissions-v2-design.md`*

## 1. Elevator pitch

AF-MPT là nơi phòng Kế toán - Tài chính **lập kế hoạch, giao trách nhiệm và review hằng tuần** các dự án lớn và BAU lớn, để HOD và các PM nhìn được ai đang chịu trách nhiệm việc gì, việc nào trễ thật, và mỗi người đóng góp bao nhiêu.

**Không phải:** công cụ theo dõi việc phát sinh qua email (đã có PMO Tracker), không phải hệ thống kế toán, không đồng bộ hai chiều với tool khác.

## 2. Người dùng

| Vai trò | Ai | Bao nhiêu | Nhu cầu chính |
|---|---|---|---|
| Owner | HOD | 1 | Nhìn tổng, duyệt thay đổi lớn, đánh giá performance |
| PM | Người phụ trách program / dự án lớn | vài người | Điều phối program, duyệt việc của Sub-PM |
| Sub-PM | Control tower / OP lead phụ trách workstream (VD: 1 KRA) | ~8 | Cập nhật plan và tiến độ workstream, duyệt Done của người làm |
| Assignee | Người được giao task / action | cả phòng | Thấy việc của mình, cập nhật, đề xuất xong |
| Viewer | Mọi thành viên phòng | ~10+ | Xem kế hoạch chung |

**Hiện trạng dùng (14/10):** chưa ai dùng đều; HOD mở 1–2 lần/tuần; mục tiêu là kéo cả phòng vào. Tất cả nhóm màn hình đều được HOD dùng, thứ tự ưu tiên: **Plan (Mind map/Outline/Gantt) → My Work + Actions/Decisions/RAID → Portfolio/Activity/Team → Briefing/Minutes/Credit**.

## 3. Dữ liệu hiện có (Portfolio, 14/10)

| Project | Hoàn thành | Quá hạn |
|---|---|---|
| MA Project | 6/43 | 22 |
| CRP | 16/186 | 134 |
| UBO Wealth Restructuring | 2/18 | 10 |
| Treasury 2026 | 0/7 | 2 |
| AF Lean Structure | 0/2 | 0 |
| AF 2026 Key Results | 0/0 (khung KRAs/Initiatives, pilot) | — |
| AF 2026 Operation | 0/0 (khung Cash out, Tax inspection, Audit 2025, FS 2026, pilot) | — |

~63% task "quá hạn" là dấu hiệu dữ liệu chưa được cập nhật, chưa chắc trễ thật. Nhiều task không có PIC.

## 4. Vấn đề phải giải (5 điểm chưa ưng của HOD)

1. **Trách nhiệm theo program/workstream, không theo task.** PM chịu trách nhiệm program, Sub-PM chịu trách nhiệm workstream, được cập nhật task/action trong phạm vi mình; hạn workstream/project chỉ Owner duyệt đổi; Done cần duyệt. Workspace dùng để quản lý performance nên phân quyền phải chặt.
2. **UI rối:** Mind map / Outline / Gantt chiếm 3 tab; view của Owner, PM, Sub-PM, Assignee chưa được thiết kế riêng.
3. **Một người nhiều tên** (VD "Hà Trương Thị Thu" / "hattt4@smartosc.com" / "hattt4") → credit và Activity Dashboard bị chia mảnh.
4. **Panel task bên phải** không kéo rộng, không mở pop-up khi cần viết update dài.
5. **Upload plan chỉ được cả project.** Cần PM/Sub-PM upload theo phạm vi program/workstream → Owner duyệt → mới ghi vào workspace.

Cộng 4 rủi ro cao từ audit: tự thăng Owner qua rules; mất cập nhật (last-write-wins); lưu thất bại không báo; giới hạn 1 MiB/document.

## 5. Phạm vi đợt này

**Trong phạm vi:**
- **B — Vá an toàn** trên kiến trúc hiện tại: B1 khóa Owner trong rules; B2 báo lỗi khi lưu thất bại; B3 cảnh báo khi lưu đè dữ liệu cũ; B4 panel task kéo rộng/pop-up.
- **P1 — Định danh theo email**: danh bạ `members`, ánh xạ tên → email (HOD duyệt), hết trùng tên.
- **P2 — Phân quyền ở server**: tách workstream + task thành document, rules mới, test rules, chuyển đổi dữ liệu có dry-run.
- **P3 — Hộp duyệt + trạng thái `Submitted` + upload plan theo phạm vi.**
- **P4 — UI theo vai trò** (mockup duyệt trước): gộp Plan thành 1 tab, Approvals cạnh My Work, tab hiện theo vai trò.
- **F — Dọn dữ liệu**: mỗi Sub-PM rà workstream của mình qua Excel → upload theo phạm vi → Owner duyệt.
- **Chốt quy ước**: định nghĩa quá hạn/xong, tên project khớp nhãn `PJ/` bên PMO, danh sách thành viên chuẩn theo email.

**Ngoài phạm vi:** realtime sync (onSnapshot), Google Chat Stage 2 / notify cho task-decision-RAID, OpenProject API, Kanban, backend thông báo, viết lại App.jsx, đồng bộ hai chiều với PMO Tracker.

## 6. User flows chính (đích)

- **Sub-PM, sáng thứ Hai:** mở app → Plan lọc sẵn workstream của mình → cập nhật status/health vài task → duyệt 2 task "Chờ duyệt" của người làm → xin Owner dời hạn workstream (1 request).
- **Assignee:** mở My Work → viết update → bấm "Đề xuất hoàn thành" → task chuyển *Chờ duyệt*.
- **Owner, review tuần:** mở Portfolio + Approvals → duyệt đổi hạn / upload plan có bản so sánh → xuất Weekly Briefing.
- **PM upload plan program:** xuất Excel program → sửa → upload chọn phạm vi program → xem bản so sánh → gửi duyệt → Owner duyệt → plan được ghi.

## 7. Định nghĩa (đề xuất, chờ HOD chốt — Q6)

- **Quá hạn:** `task.end < hôm nay` và status ∈ {Planned, InProgress}. `Submitted`, `Completed`, `Dropped` không tính.
- **Xong:** status `Completed` **và** đã được người duyệt đúng cấp duyệt. Credit chỉ ghi khi đã duyệt.
- **Dropped:** không còn làm; đề xuất và duyệt như Done; không xóa.

## 8. Tiêu chí nghiệm thu (cả đợt)

1. Tài khoản `@smartosc.com` không phải Owner **không** ghi được `workspaceOwner*` (thử qua console/DevTools, bị rules từ chối).
2. Mọi lần lưu bị từ chối đều hiện thông báo rõ cho người dùng.
3. Mỗi người chỉ có **1 dòng** trong Activity Dashboard, Team, Credit.
4. Sub-PM sửa được task trong workstream của mình, **không** sửa được workstream khác (kiểm bằng tài khoản thật + test rules).
5. Assignee không tự đặt được `Completed`; task chỉ thành Completed sau khi người duyệt đúng cấp duyệt.
6. Đổi hạn workstream/program/project chỉ có hiệu lực sau Owner duyệt.
7. PM/Sub-PM upload plan theo phạm vi → Owner thấy bản so sánh → duyệt mới ghi; dòng ngoài phạm vi bị loại có báo.
8. Plan (Mind map/Outline/Gantt) là 1 tab; mỗi vai trò mở đúng màn hình mặc định của mình.
9. Panel task kéo rộng được và mở toàn màn hình được.
10. Không mất dữ liệu: số task/action/decision/RAID trước và sau chuyển đổi khớp nhau theo từng project (báo cáo đối chiếu).
