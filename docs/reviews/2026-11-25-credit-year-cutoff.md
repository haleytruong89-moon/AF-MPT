# Credit và performance theo năm: cut-off và dữ liệu — 25/11/2026

- Câu hỏi của HOD: cần báo cáo performance và credit theo năm; dự án vắt năm thì số liệu có đúng không?
- Phạm vi: code `main` sau #65 (cách tính credit trong `src/App.jsx`: `computeProjectCredits`, `computeWorkspaceCredits`, `getEffectiveWeights`, `getEffectiveCreditShares`; ngày đóng task trong `src/closeFlow.js`). Đọc code, chưa đọc dữ liệu production.

## 1. App đang tính thế nào

| Thành phần | Hiện tại | Chỗ trong code |
|---|---|---|
| Năm của credit | **Một năm cho cả project** (`project.creditYear`), không có năm theo task | `computeWorkspaceCredits`: lọc theo `proj.creditYear` |
| Pool | Một pool cho cả project (`creditPoints`, mặc định 100) | `computeProjectCredits` |
| Chia pool | Project lead lấy trước % (mặc định 10% nếu có lead), phần còn lại chia program → work stream → task theo weight. **Thiếu weight ở bất kỳ anh em nào → chia đều cả nhóm** | `getEffectiveWeights` |
| Khi nào được tính "earned" | Task đang ở trạng thái **Completed** lúc xem báo cáo. Không xét ngày đóng | `isTaskCredited` |
| Ngày đóng | `approvedAt` (ghi khi duyệt hoặc đóng thẳng), có từ P3.1 (~cuối 10/2026). Reopen thì xóa | `src/closeFlow.js:205, 242, 263` |
| Project lead | Earned = phần lead × % hoàn thành của cả project lúc xem | `computeProjectCredits` bước 1 |
| Khóa weight | Chỉ khóa **sửa weight**; không khóa thêm / bỏ task, không khóa pool, không khóa năm | Outline, Project settings |
| Số liệu | **Luôn tính lại từ dữ liệu hiện tại**; không có bản chốt (snapshot) nào được lưu | — |

## 2. Rủi ro với báo cáo theo năm

| # | Rủi ro | Ví dụ |
|---|---|---|
| Y1 | **Dự án vắt năm bị gán trọn vào một năm.** Task đóng năm 2027 của project `creditYear = 2026` vẫn tính vào báo cáo 2026 | CRP 2026 kéo sang 3/2027: phần làm năm 2027 đổ về 2026 |
| Y2 | **Đổi `creditYear` thì cả lịch sử dời năm.** Chuyển project sang 2027 để tính tiếp thì toàn bộ credit đã đạt năm 2026 biến khỏi báo cáo 2026 | Báo cáo 2026 đã nộp không còn khớp |
| Y3 | **Số đã đạt bị thay đổi về sau.** Thêm một task (hoặc một task chưa có weight) làm phần của mọi task cũ, kể cả đã Completed, nhỏ lại; Drop / sửa weight / đổi pool cũng vậy | Tháng 1/2027 thêm 5 task vào work stream → credit 2026 của mọi người trong đó giảm |
| Y4 | **Reopen xóa credit đã đạt**, kể cả của năm trước | Mở lại task đóng 12/2026 vào 2/2027 → mất khỏi báo cáo 2026 |
| Y5 | **Credit của project lead đi theo % hoàn thành lúc xem**, không theo năm | Lead của project vắt năm: số 2026 tăng dần sang 2027 |
| Y6 | Project không có `creditYear` được tính vào **mọi năm** | Một project cũ chưa đặt năm xuất hiện trong cả 2025 và 2026 |
| Y7 | Task đóng trước P3.1 **không có ngày đóng** (`approvedAt`) | Không xếp được vào đúng năm / đúng hạn |
| Y8 | Hai cách đếm khác nhau: "Closed by me" / "By person" đếm theo **ngày đóng**; credit đếm theo **năm của project** | Cùng một người, cùng năm, hai con số không khớp phạm vi |
| Y9 | Năm tính theo giờ của trình duyệt | Ổn khi mọi người ở VN; cần cố định múi giờ khi chốt sổ |

Kết luận: **báo cáo năm hiện nay không tái lập được** — cùng câu hỏi "credit 2026 của Lan", hỏi vào 12/2026 và vào 3/2027 sẽ ra hai số khác nhau.

## 3. Phương án

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Mỗi project là một năm** (giữ mô hình hiện tại). Quy ước: dự án vắt năm phải tách thành project mới cho năm sau (vd "CRP 2027"), chuyển task còn mở sang | Không đổi cách tính | Tách project phải làm bằng script (chuyển task v2 giữa project là việc lớn); lịch sử một dự án nằm ở hai nơi; **vẫn không sửa Y3, Y4** (số năm trước vẫn bị thay đổi) |
| **B. Credit tính theo năm đóng task** (`approvedAt`): task đóng năm nào tính vào năm đó; task đang mở là "projected" của năm hiện tại. Project giữ một pool, dự án vắt năm chia tự nhiên theo năm đóng | Đúng nguyên tắc "ghi nhận khi hoàn thành"; khớp với "Closed by me" / "By person" (sửa Y1, Y2, Y8); không phải tách project | Vẫn tính lại từ dữ liệu sống nên **Y3, Y4, Y5 còn** nếu đứng một mình; cần quy tắc cho task không có ngày đóng (Y7) |
| **C. Chốt sổ cuối năm (snapshot)**: chị bấm "Close credit year 2026" → app lưu bản chốt theo người, theo task (cp, đúng hạn / trễ) vào Firestore; báo cáo năm đã chốt đọc từ bản chốt, mọi thay đổi sau đó không ảnh hưởng | Số năm đã chốt **không bao giờ đổi** (sửa Y3, Y4, Y5); đúng chuẩn thị trường (calibration rồi chốt); làm bằng chứng đánh giá được | Thêm collection + rules + test emulator; muốn sửa sai sau khi chốt phải mở lại có ghi log |

**Khuyến nghị: B + C.**
1. **B** làm năm của credit trùng với năm thực sự hoàn thành, nên dự án vắt năm tự chia đúng, và mọi màn hình (Credits, My record, By person) cùng một quy tắc.
2. **C** đóng băng số đã báo cáo — đây là điều kiện để dùng cho đánh giá: một con số đã đưa vào review không được tự thay đổi.
3. A tốn công tách dữ liệu mà vẫn không giải quyết việc số cũ bị thay đổi.

## 4. Nếu làm B + C — các quyết định chi tiết (khuyến nghị kèm theo)

| Điểm | Khuyến nghị | Lý do |
|---|---|---|
| Ngày "đóng" | `approvedAt`, giờ Việt Nam (Asia/Ho_Chi_Minh) | Ngày quyết định cuối cùng; cố định múi giờ khi chốt |
| Task đóng trước P3.1 (không có `approvedAt`) | Script một lần (xem trước → chị duyệt): lấy ngày từ Activity (dòng đóng task) nếu có, không thì ngày `end`; ghi vào `approvedAt` và đánh dấu `approvedAtSource: 'backfill'` | Có ngày cho mọi task đã đóng; vẫn biết ngày nào là suy ra |
| Project lead | Phần của lead tính theo % task **đóng trong năm** đó | Cùng nguyên tắc với task |
| `creditYear` của project | Không còn quyết định năm của credit; giữ làm "năm đặt pool / khóa weight" | Tránh Y2 |
| Pool của dự án vắt năm | Một pool cho cả đời dự án; mỗi năm nhận phần của các task đóng trong năm đó | Không phải đặt pool mới mỗi năm; nếu chị muốn pool theo năm thì cần làm thêm (hỏi lại) |
| Chốt sổ | Chỉ chị; chốt theo năm (mọi project cùng lúc); sau khi chốt, báo cáo năm đó đọc bản chốt; "Reopen year" chỉ chị, có ghi log và lý do | Một mốc rõ ràng cho cả phòng |
| Ai đọc bản chốt | Chị đọc tất cả; mỗi người đọc bản của mình (khớp câu 6); PM không đọc điểm (khớp câu 2) | Theo quyết định 25/11 |
| Cảnh báo trước khi chốt | Liệt kê task còn Submitted, task đóng không có ngày, project chưa khóa weight | Chốt khi dữ liệu sạch |

Cỡ việc: B vừa (đổi cách tính, test kỹ với ví dụ tính tay); C vừa (collection mới + rules + màn chốt sổ); script backfill nhỏ. Thứ tự đề xuất: B + backfill trước tháng 12, C trước 31/12/2026.

## 5. Việc làm ngay, không cần quyết định

- **Kiểm dữ liệu (chỉ đọc):** đếm task Completed / Dropped không có `approvedAt`, project không có `creditYear`, project chưa khóa weight. Cần chị cho phép chạy script chỉ đọc trên production (như `--summary` lần trước).
- PR #66 (My record) có thể merge: phần credit trong đó hiện đi theo năm của project như màn Credits; sẽ đổi theo quy tắc B khi làm.
