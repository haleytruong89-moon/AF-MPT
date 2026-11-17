# Thử nhanh wave 3 trên production (~30 phút)

Chạy trên https://af-mpt.vercel.app sau khi mọi người hard-refresh (Ctrl+Shift+R).
Cần 3 tài khoản: **Owner** (HOD), **PM** (người là PM của ít nhất 1 program), **Member** (không có vai trò, là member của 1 project).
Mỗi dòng: làm gì → kết quả đúng. Sai ở đâu thì chụp màn hình + ghi số dòng gửi lại.

Không cần xuất backup cho lần thử này: các bước dưới chỉ thêm comment / đổi trạng thái trên task thử. Chọn **một task thử** ở một project ít quan trọng và ghi tên nó ở đây: ____________

## A. Member (không vai trò)

| # | Làm gì | Đúng là |
|---|---|---|
| A1 | My Work | Không có nút đổi trạng thái trên task không phải của mình; không có badge đỏ cho mitigation RAID của program khác (dòng ghi "Only the PM / Sub-PM of … can update this") |
| A2 | Mở task thử của người khác → thêm 1 comment → reload | Comment còn đó, không có "Not saved" |
| A3 | Viết comment `@<tên đầy đủ của PM>` trên task thử | PM thấy trong mục Mentions (bước B5) |
| A4 | Mở một RAID đang chờ duyệt (nếu có) | Nhãn "Waiting for Owner approval", dòng "Only the Owner activates RAID items." |
| A5 | Plan → Outline | Không có dòng gợi ý kéo-thả, không kéo được |
| A6 | Mở một link task của project mình không thuộc (Owner gửi) | Toast "You don't have access to that project, or it was removed." |

## B. PM

| # | Làm gì | Đúng là |
|---|---|---|
| B1 | Plan → Outline | Gợi ý "Drag tasks between work streams in your programs" |
| B2 | Kéo một task sang program khác rồi thả | Không chuyển; toast "Tasks can only move within your own program." |
| B3 | Mở task thử, sửa ngày | Thấy dòng "Work stream dates: …"; ngày ngoài khung → báo, không lưu |
| B4 | Roles… | Dòng "Only project members are listed. Ask the Owner to add someone." |
| B5 | My Work → Mentions | Có comment của A3 |
| B6 | Reject một yêu cầu đóng task thử (có lý do) | Người gửi quay lại tab của họ (sau ~1 phút) thấy "Close request rejected by …: lý do" trong Needs attention |
| B7 | Plan → Gantt | Gom Program → Work stream, gập / mở được, % khớp Mind map |

## C. Owner (HOD)

| # | Làm gì | Đúng là |
|---|---|---|
| C1 | Portfolio | Dải "Waiting for you (n)"; Open mở đúng task / tab RAID; số Submitted khớp My Work "Needs my approval" |
| C2 | Bấm một thẻ trong Health heatmap | Mở project ở tab Plan |
| C3 | Chọn All projects → Gantt, rồi → Mind map | Gantt mọi project (nút Open); Mind map hiện "Choose a project" |
| C4 | Coaching → Activity log; Dashboard → View full log | Cửa sổ log, lọc theo project / người / loại / ngày / chữ được |
| C5 | Team và Portfolio của cùng một người | Số task mở khớp nhau; Submitted hiện riêng "awaiting approval" |
| C6 | Members của một project | Chỉ Owner / Member, một nút "+ Add", ghi chú về Roles… |
| C7 | ⋯ → Restore from JSON… với file backup mới nhất | Bảng "Restore by script" kèm lệnh `npm run p2:restore …`; **không ghi gì** |
| C8 | People directory → Deactivate (một người bất kỳ) → **Cancel** | Khung hỏi lại liệt kê vai trò / việc còn giữ; Cancel thì không đổi gì |
| C9 | Team → View as một member → ⋯ | Chỉ Meeting mode, Minutes, Export Excel; thoát View as về tab Team |
| C10 | ⋯ → Meeting mode | Mặc định project đang chọn; nút This project / All projects |
| C11 | Reassign người duyệt cho một yêu cầu đóng task thử (project có webhook Chat) | Space Chat nhận thẻ "APPROVER CHANGED" |

## Sau khi thử

Đóng lại task thử nếu đã đổi trạng thái. Gửi kết quả (đạt / sai ở dòng nào) để em sửa trước khi onboard.
