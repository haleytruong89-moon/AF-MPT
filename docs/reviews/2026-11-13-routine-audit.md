# Audit thao tác hằng ngày theo vai trò — 13/11/2026

- Phạm vi: code `main` tại `5b1db0d` (sau P4-A/B, rules wave 2 đã publish, cả 8 project ở v2).
- Cách làm: đọc code theo từng bước của 3 vai (member, PM / Sub-PM, Owner), đối chiếu với `firestore.rules`. Không chạy trên trình duyệt, không đụng dữ liệu. Số dòng là của `src/App.jsx` trừ khi ghi khác.
- Mục "chưa xác minh" = phụ thuộc dữ liệu production, chưa kiểm.

## 1. Trả lời các câu HOD hỏi

| Câu hỏi | Hiện trạng | Đề xuất |
|---|---|---|
| Gantt và Outline không xem được All projects | Đúng. Mind map / Outline / Gantt / Dashboard chỉ vẽ 1 project; ở All projects chỉ có dòng "This view is project-specific" (14663) | Gantt: làm bản tổng hợp cho All projects (dưới). Outline: không làm bản all-projects (là màn sửa, 8 project × hàng trăm dòng); thay bằng danh sách project để bấm vào |
| Gantt không có tiêu đề Workstream / Program | Đúng. `GanttView.tsx` vẽ 1 dòng / task, tên program và WS chỉ có trong tooltip; task Dropped / Submitted vẽ như Planned | Thêm dòng nhóm Program → Workstream (thu gọn được), thanh tổng theo ngày sớm nhất / muộn nhất |
| Gantt xem All projects để thấy tải cả phòng | Chưa có màn nào cho thấy tải theo thời gian × người hoặc × project. Portfolio "Peak Season" theo tuần nhưng không theo người | Gantt ở All projects: 1 dòng / project → program → WS (không xuống task), cùng trục thời gian. Vừa sức: dữ liệu không đổi, chỉ thêm kiểu dòng trong `GanttView.tsx` |
| Ô chọn project và FOCUS đã hợp lý chưa, có trùng không | Chưa. (a) FOCUS chỉ có tác dụng ở Mind map, Outline, Gantt, Dashboard, RAID; Actions, Decisions, số đếm trên tab, dòng "% · overdue" trên header, Meeting, Briefing, Excel đều bỏ qua. (b) FOCUS vẫn hiện ở My Work, Portfolio, Team, Credits, Activity dù không có tác dụng; ô chọn project cũng vậy. (c) RAID có bộ lọc riêng (`raidScopeProgramId`) đè lên FOCUS và kẹt lại khi đổi project (14617). (d) FOCUS kẹt giá trị cũ sau New project / Import / Delete. (e) PM mở app chỉ được lọc sẵn nếu project đang nhớ có program của mình; đổi project là mất | Một quy tắc: ô project + FOCUS chỉ hiện ở tab theo project; tab liên project (My Work, Portfolio, Team, Credits, Activity) ẩn cả hai. FOCUS áp cho mọi tab theo project (kể cả Actions, Decisions, số trên header). Bỏ bộ lọc riêng của RAID. Đổi project → tự lọc lại theo program của PM |

## 2. Gốc lỗi lớn nhất: nút hiện ra nhưng rules từ chối, app vẫn báo "đã lưu"

Mọi sửa đổi được hiện ngay và ghi Activity trước khi biết kết quả lưu. Outline, Mind map, RAID, Decisions đã ẩn đúng theo quyền; **Actions, các ô phụ trong panel task và Project settings thì chưa**. Khi rules từ chối: chỉ có một băng báo chung ("…use Submit as done…", 2072), sửa đổi bị từ chối vẫn nằm trên màn hình, và các lần lưu sau của cùng project cũng hỏng cho tới khi reload.

| # | Mức | Ai gặp | Việc gì | Bằng chứng |
|---|---|---|---|---|
| A1 | Cao | Member, PM | Tạo action: member không được tạo; PM chỉ tạo được khi gắn milestone thuộc WS mình quản lý, nhưng form ghi "optional". App báo "Action created", còn gửi Chat cho action không tồn tại | nút 5390, 11911, 4048; rules 1071–1075 |
| A2 | Cao | PIC của action | Sửa tiêu đề / PIC / hạn / priority / Cancelled: rules chỉ cho PIC đổi status, subtasks, updates | 9114–9175; rules 1041–1054 |
| A3 | Cao | Mọi người | Panel task: Health, ghi chú health, References, Post update, Resolve blocker hiện cho cả người không phải PIC / contributor / quản lý; PIC không comment được trên task đã đóng | 3713, 3728, 3972, 4001; rules 856–887, 962–970 |
| A4 | Cao | Member, PM | Project settings: sửa tên, mã, thành viên, bấm Save → "Project settings saved", thực tế bị từ chối | 14803, 15987; rules 199–203 |
| A5 | Cao | Tất cả | Activity ghi trước khi lưu xong → nhật ký có dòng cho thay đổi không hề xảy ra (dữ liệu dùng chấm performance) | 13700–13796; rules 1421–1434 |
| A6 | Cao | Người được giao sub-task nhưng không phải PIC của action cha | Bấm ✓ bị từ chối, badge đỏ không bao giờ tắt | 958–977; rules 1046–1047 |
| A7 | TB | Tất cả | Băng báo từ chối không nói cái gì bị từ chối, không hoàn tác, gợi ý sai | 2072 |
| A8 | TB | Contributor | Dòng "Tasks I contribute to" có ✓ và menu status, bấm chỉ ra thông báo từ chối | 12072–12077 |

Hướng sửa chung: (1) ẩn / khóa nút theo quyền bằng helper trong `roleUi.js`; (2) khi bị từ chối: trả project về bản đã lưu gần nhất và báo rõ mục nào; (3) Activity và thông báo Chat chỉ ghi sau khi lưu thành công.

## 3. Member

| # | Mức | Việc gì | Bằng chứng |
|---|---|---|---|
| M1 | Cao (chặn onboard, đã biết) | Task giao trước lần đăng nhập đầu: hiện trong My Work nhưng mọi thao tác bị từ chối vì chưa gắn uid | `planV2Save.js:432`; cần script backfill |
| M2 | Cao (chưa xác minh trên dữ liệu) | @mention so với tên Google, trong khi ô chọn chèn tên trong danh bạ → có thể không ai nhận được mention; mention trên task Submitted / Completed không được quét | 876, 924, 2271 |
| M3 | TB | Bị Reject: không có mục báo, lý do chỉ nằm trong Updates; app không tự tải lại dữ liệu khi mở lại tab | `closeFlow.js:253`; không có refresh |
| M4 | TB | My Work "By project": mention chưa đọc là dòng cắt 55 ký tự, không bấm được, tự mất sau 5 giây | 11275, 11558 |
| M5 | TB | Bấm task ở My Work → bị chuyển sang Outline, dòng task thường không thấy (WS thu gọn / FOCUS khác); quay lại mất trạng thái | 14556–14562 |
| M6 | TB | Mitigation và Decision nằm trong My Work kèm badge đỏ nhưng member không xử lý được, không có giải thích | 999–1032, 9280 |
| M7 | Thấp | Backup JSON: member tải được toàn bộ project mình thuộc; "Mark done" thực ra là gửi duyệt; Export Excel ở All projects không làm gì | 14246, 8971, 14242 |

## 4. PM / Sub-PM

| # | Mức | Việc gì | Bằng chứng |
|---|---|---|---|
| P1 | TB | RAID do PM tạo luôn chờ Owner duyệt; PM không duyệt được item của Sub-PM, không thấy item đang chờ; helper `canActivateRaid` có nhưng không dùng | 10099, 10418; `closeFlow.js:377` |
| P2 | TB | Yêu cầu đổi hạn của Assignee chỉ Owner duyệt; PM tự sửa hạn thì yêu cầu vẫn treo "pending owner review"; helper `canApproveDeadline` không dùng | 3458, 3251; `closeFlow.js:354` |
| P3 | TB | Kiểm "ngày task trong hạn WS" chặn cả khi chỉ sửa tên / PIC; hạn WS không hiện ở đâu | 3399, 3436 |
| P4 | TB | Không xóa được WS dù mọi task đã Dropped; lời nhắn "Move or drop its tasks" sai | `treeGuards.js:2–10` |
| P5 | TB | Ô chọn Sub-PM chỉ liệt kê member của project, không giải thích | `roleAssign.js:24` |
| P6 | TB / Thấp | Gợi ý kéo-thả hiện cho mọi người; thả bị từ chối không báo lý do | 7389, 7333 |
| P7 | TB / Thấp | Chat chỉ báo Submitted / Rejected; Reassign, leo thang 3 ngày, Approved không báo; deep link tới project không có quyền thì im lặng | 13515, 13049 |
| P8 | Thấp | PM là PIC: "Submit as done" không nói ai duyệt cho tới khi có toast; Mind map vẽ Submitted như Planned | `closeFlow.js:69`; 7013 |

## 5. Owner

| # | Mức | Việc gì | Bằng chứng |
|---|---|---|---|
| O1 | Cao | **New project và Import Excel tạo project v1**: không có vai trò, không qua duyệt Done / Dropped, không khóa credit, không báo gì (Add-Hoc sáng 13/11 là trường hợp này, đã chuyển tay) | 14134–14182; `persistence.js:89–110` |
| O2 | Cao | Delete project báo thành công kể cả khi ghi lỗi; lời xác nhận "cannot be undone" trong khi thực tế chỉ đánh dấu xóa | 14287; `storage-shim.ts:686` |
| O3 | Cao | Lock weights: xác nhận xong hiện "Locked" nhưng chỉ lưu khi bấm Save ở cuối; đóng modal là mất | 15530 |
| O4 | TB | Portfolio (màn mở đầu): bấm vào project chỉ đổi ô chọn, màn hình không đổi; các biểu đồ không bấm được | 14634 |
| O5 | TB | Không có chỗ xem toàn bộ việc đang chờ duyệt / leo thang của cả phòng; thẻ "Pending approvals" ở Team thực ra là yêu cầu đổi hạn | `approvalsInbox.js:38–66`; 9590 |
| O6 | TB | View as: ghi "read-only" nhưng New / Import / Restore / Delete / Members / Directory vẫn ghi thật; Project settings báo "saved" giả; thoát ra về My Work thay vì Team | 8657, 14134–14287 |
| O7 | TB | Restore from JSON: hỏi xác nhận "REPLACE…" rồi mới từ chối vì mọi project đã v2 | 14259 |
| O8 | TB | Members modal vẫn cho chọn Owner / Operator / Viewer (vai trò v1) trên project v2; **không có nút đổi visibility restricted / department** dù đã quyết | `MembersModal.tsx:296` |
| O9 | TB | Tab "Activity" là bảng điểm coaching, không phải nhật ký; nhật ký chỉ có 15 dòng mới nhất ở Dashboard | 8082, 7705 |
| O10 | TB | Số liệu lệch giữa các màn: người (tên thô vs danh bạ), task mở (có / không tính Submitted), overdue (task vs task + action), credit (theo năm vs mọi năm); "% complete" có trọng số nhưng đứng cạnh "done/total" | 8320, 9491, 1217 |
| O11 | TB | Tab Briefing mở chế độ member cho Owner; bản digest chỉ mở được từ băng thứ Hai. Meeting mode chạy mọi project, bỏ qua project đang chọn | 14441, 5929 |
| O12 | TB | Webhook Chat lưu khi rời ô, kể cả khi bấm Cancel; lời hướng dẫn cũ | 15954 |
| O13 | TB | Deactivate trong People directory: 1 cú bấm, không xác nhận, không cho thấy task / vai trò người đó đang giữ | `DirectoryModal.tsx:214` |
| O14 | Thấp | Header: dải tab rớt xuống dòng 2 cả khối; menu tài khoản đặt cứng vị trí; "Meeting mode" nằm dưới nút tên "Export / Import" | 14358, 14833 |

## 6. Điểm đang làm tốt

- Luồng Submit as done / Approve / Reject / Withdraw đi qua một chỗ, có lý do bắt buộc, có hoàn tác khi lỗi.
- Outline, Mind map, RAID, Decisions ẩn đúng nút theo quyền.
- "Needs my approval" trong My Work: duyệt tại chỗ, có số ngày chờ và nhãn leo thang, có badge trên tab.
- Đổi vai trò có xác nhận và liệt kê yêu cầu đang chờ sẽ chuyển người duyệt.
- Backup JSON từ chối tạo file thiếu; chip lưu + nút thử lại; chip "Your role".

## 7. Đề xuất thứ tự sửa (wave 3)

1. **W3-A — Không báo lưu giả** (A1–A8, O1, O2, O3): ẩn nút theo quyền cho Actions / panel task / Project settings; từ chối thì trả về bản đã lưu và báo rõ; Activity + Chat sau khi lưu xong; project mới tạo thẳng v2; Delete / Lock weights báo đúng.
2. **W3-B — Trước onboard** (M1, M2, M3): script backfill uid (xem trước → duyệt); mention theo danh bạ; mục "bị Reject" trong My Work; tải lại khi quay lại tab.
3. **W3-C — Plan / All projects / FOCUS** (mục 1, O4, O5): Gantt có dòng nhóm; Gantt tổng hợp cho All projects; quy tắc hiện / ẩn ô project + FOCUS; Portfolio bấm vào được và có dải Approvals.
4. **W3-D — Owner vận hành** (O6–O13) và **PM** (P1–P8).

## 8. Cần HOD quyết

1. Comment: cho mọi thành viên của project comment trên mọi task (đổi rules), hay chỉ PIC / contributor / quản lý như hiện nay (khi đó người được @mention không trả lời được)?
2. RAID và yêu cầu đổi hạn: PM / Deputy duyệt trong program của mình, hay vẫn chỉ Owner?
3. Sub-task: người được giao sub-task tự tick xong (đổi rules), hay chỉ PIC của action?
4. Backup JSON: chỉ Owner, hay giữ cho mọi người?
5. Visibility restricted / department: làm nút trong Project settings bây giờ, hay bỏ khỏi quyết định?
