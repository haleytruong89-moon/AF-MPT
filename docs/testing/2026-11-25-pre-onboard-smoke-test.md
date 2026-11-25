# Thử nhanh trước onboard: thay đổi 25/11 (~45 phút)

Chạy trên https://af-mpt.vercel.app sau khi mọi người hard-refresh (Ctrl+Shift+R).
Cần 4 tài khoản: **Owner** (HOD), **PM** (PM của ít nhất 1 program), **Member** (không vai trò, là member của 1 project), **Coordinator** (một người HOD sẽ gán ở bước D1, nên chọn một Sub-PM).
Mỗi dòng: làm gì → kết quả đúng. Sai ở đâu thì chụp màn hình + ghi số dòng gửi lại. Mở console trình duyệt (F12) suốt buổi; thấy dòng đỏ có chữ `refused` / `permission` thì chụp lại.

**Trước khi bắt đầu:** Owner xuất Backup JSON + Excel (⋯ → Backup JSON, Export Excel). Các bước dưới chỉ ghi trên **project thử** (tạo ở bước O1, xóa ở bước O12) và trên **một task thử** của một project ít quan trọng: ____________

Phần chưa làm thật: **không** bấm Close credit year (chỉ mở rồi Cancel), **không** đóng project thật.

## O. Owner (HOD)

| # | Làm gì | Đúng là |
|---|---|---|
| O1 | ⋯ → New project… → Start from: "Copy structure from: AF 2026 Operation" | Tên tự điền "AF 2027 Operation"; đổi tên thành "TEST copy 2027" → Create |
| O2 | Mở TEST copy 2027 → Plan → Outline; Roles… | Có đủ program / work stream của AF 2026 Operation, **không có task**; PM / Deputy / Sub-PM giống bản gốc (người còn active) |
| O3 | Project settings → Project status → Close project… → Close project | Banner "🔒 This project is closed …"; project nằm cuối ô chọn project, nhóm "Closed projects"; không còn trong My Work / Portfolio |
| O4 | Bấm Reopen trên banner | Banner mất; project trở lại danh sách thường |
| O5 | Mở một project thật còn task mở → Project settings → Close project… | Báo "Can't close yet" + danh sách task còn mở; **không đóng** |
| O6 | Tab Credits → chọn Year 2026, rồi "Lifetime (all years)" | Số theo năm; Lifetime ≥ 2026 |
| O7 | Credits → kéo xuống bảng **Effort** → By person / By project → bấm 1 ô | Ma trận người × project, ô "cp (số task)"; bấm ô ra danh sách task (closed on, On time / Late / No close date) |
| O8 | Effort → Copy table → dán vào Google Sheets | Ra bảng đúng cột |
| O9 | Credits → Year 2026 → **Close credit year 2026…** → đọc danh sách → **Cancel** | Danh sách "Check before closing" (task không có ngày đóng, project chưa khóa trọng số…); Cancel thì không ghi gì, không có 🔒 |
| O10 | ⋯ → Export Excel ở một project có chọn phạm vi program | File tên có tên program; có cột Contributors, Health, Closed on, Approved by, Original end, Latest update. Chọn All projects → Export Excel → toast "Choose a project first" |
| O11 | Tab Briefing | Mở là có sẵn nội dung theo project / phạm vi đang chọn; đổi ô Project → nội dung đổi; sửa 1 chữ → Copy rich text → dán vào Gmail: thấy chữ đã sửa |
| O12 | Chọn TEST copy 2027 → ⋯ → Delete project | Hộp xác nhận nhắc dùng Close project cho việc đã xong; Delete → project biến mất |

## P. PM

| # | Làm gì | Đúng là |
|---|---|---|
| P1 | Mở project của mình (phạm vi = program của mình) → ⋯ → Meeting mode | Tiêu đề có "Program: …"; có khung Overdue và Due in the next 7 days; danh sách dài có "+N more" |
| P2 | Trong Meeting mode bấm một task | Thoát Meeting mode, mở panel task đó |
| P3 | ⋯ → Minutes… | Mặc định project đang mở, từ ngày = hôm nay − 7; Attendees điền sẵn PM / Sub-PM / PIC task mở |
| P4 | Tab Briefing | Có khối "👤 For you" đầu tiên nếu có việc của mình quá hạn / chờ mình duyệt |
| P5 | Duyệt (Approve) yêu cầu đóng task thử do Member gửi (bước M3) | Member thấy task vẫn trong "Sent for approval" kèm nhãn xanh "✓ Approved by …" |

## M. Member (không vai trò)

| # | Làm gì | Đúng là |
|---|---|---|
| M1 | My Work → task thử của mình → Request deadline change | Hộp thoại mở ngay tại My Work (không nhảy sang task); gửi → toast "Deadline change sent to the Owner." |
| M2 | My Work → Sent for approval | Dòng "Deadline change … → … · Waiting for Owner since …" |
| M3 | Submit as done task thử | Hiện trong Sent for approval chờ PM (bước P5) |
| M4 | ⋯ → Weekly briefing… | Mở được (Member không có tab Briefing) |
| M5 | My Work → My record → My credit | Năm 2026 tính trực tiếp (chưa có 🔒 vì chưa chốt năm) |

Owner, sau M1: mở task thử → **Reject** yêu cầu đổi deadline, ghi lý do. Member reload: Needs attention có "✕ Deadline change rejected by …: lý do"; trong task có dòng "Last deadline request …: Rejected by …".

## D. Coordinator

| # | Ai | Làm gì | Đúng là |
|---|---|---|---|
| D1 | Owner | Project thật → ⋯ → Roles… → Coordinators → + Add… → chọn người → Add | Chip tên người đó; Activity có dòng "Coordinator added: …" |
| D2 | Coordinator | Hard-refresh → header project | Nhãn vai trò "Coordinator"; có tab Briefing, Dashboard |
| D3 | Coordinator | Actions → New action **không chọn task**, PIC là một member → Save → reload | Lưu được, không có "Not saved" |
| D4 | Coordinator | Decisions → ghi 1 decision gắn task ở **program không phải của mình** → reload | Lưu được; PM của program đó sửa được decision này |
| D5 | Coordinator | RAID → đăng ký 1 risk ở một program bất kỳ | Lưu được, trạng thái chờ Owner kích hoạt; không có nút Activate |
| D6 | Coordinator | Mở một task bất kỳ → thử đổi ngày / trạng thái | Không có nút đổi, hoặc bị từ chối; được thêm action trên task |
| D7 | Coordinator | Cancel action vừa tạo ở D3 | Thành "Cancelled", không có nút Delete |
| D8 | Coordinator | My Work | Nếu project có action quá hạn: mục "📌 Project follow-ups" |
| D9 | Owner | Roles… → bỏ người đó (✕) nếu chỉ thử | Chip mất; Activity "Coordinator removed: …" |

## Sau khi thử

Đóng lại task thử nếu đã đổi trạng thái; hủy (Cancel) action / decision / RAID thử nếu không cần giữ. Gửi kết quả (đạt / sai ở dòng nào) để em sửa trước khi onboard.
