# Rà soát UX/UI theo nhịp làm việc của Member, PM, Sub-PM — 25/11/2026

- Phạm vi: code `main` tại `b01d1a4` (sau wave 3 và Replace person). Vai Owner không nằm trong đợt này.
- Cách làm: đi theo thao tác của từng vai qua code theo nhịp ngày / tuần / tháng / quý / năm, rồi đối chiếu với 35 tiêu chí rút từ tài liệu của các công cụ quản lý công việc và performance trên thị trường. **Không chạy trên trình duyệt, không đụng dữ liệu.** Các phát hiện mức Cao đã được kiểm lại trên code.
- Chi tiết đầy đủ (tiếng Anh, có số dòng code và link nguồn) ở thư mục `docs/reviews/2026-11-25-ux-audit/`: `member.md` (21 phát hiện, mã MB-), `pm-sub-pm.md` (34 phát hiện, mã PM-, và mục ô project + FOCUS), `market-practices.md` (chuẩn thị trường + 35 tiêu chí).
- Giới hạn về nguồn thị trường: trang PMI chặn truy cập nên không có trích dẫn trực tiếp từ PMBOK; một số trang trợ giúp của Asana, ClickUp, monday.com chỉ lấy được qua tóm tắt tìm kiếm. Phụ lục ghi rõ từng ý là "Confirmed", "Search summary" hay "Unconfirmed".

## 1. Kết luận

1. **Khung đã đúng hướng thị trường.** Member mở app là vào việc của mình; quản lý thấy yêu cầu chờ duyệt ở trên cùng kèm số ngày chờ; nút bấm khớp với quyền; lưu hỏng thì báo và quay về bản đã lưu. Đây là những điểm các công cụ lớn (Asana My Tasks, Linear My Issues) cũng làm.
2. **Member: màn mặc định che mất ba việc xảy ra với việc của mình.** Chế độ mặc định "By project" của My Work không cho thấy rõ bị mention, bị từ chối đóng task, và kết quả xin đổi deadline. Các sửa đổi wave 3 cho những việc này chỉ có tác dụng ở chế độ "By urgency".
3. **PM / Sub-PM: thiếu "góc nhìn quản lý".** Mọi màn hoặc là "việc tôi là PIC" (My Work), hoặc là "cả project". Việc người quản lý cần xem đầu ngày (trong phạm vi của tôi cái gì bị chặn, quá hạn, lâu không cập nhật, đang chờ duyệt; ai đang quá tải) không nằm trên màn nào của họ; một phần chỉ có ở tab của Owner.
4. **Ô chọn project + FOCUS chưa nhất quán** (việc C2 đã hoãn): FOCUS chỉ lọc 5 màn, bị bỏ qua ở Actions, Decisions, số trên header, Meeting mode, Minutes, Briefing, Excel; đổi project là mất; Sub-PM không lọc được tới work stream của mình.
5. **Nhịp tháng / quý / năm gần như chưa được phục vụ** cho cả ba vai: không ai ngoài Owner xem được "đã giao được gì, đúng hạn không", dù dữ liệu đã lưu sẵn (ngày duyệt, người duyệt). App dùng để chấm performance nhưng người được chấm không xem được hồ sơ của chính mình.

## 2. Mức phục vụ theo vai và nhịp

| Nhịp | Member | PM | Sub-PM |
|---|---|---|---|
| Ngày | **Tạm.** Đổi status 2 bấm, comment 2–3 bấm. Yếu ở mention, bị từ chối, mở task bị đẩy sang Outline | **Tạm.** Duyệt tại chỗ tốt. Thiếu danh sách "cần tôi" theo program; blocker không tới được người quản lý | **Yếu.** Như PM, nhưng mọi màn lấy cả program cha; work stream của mình không được đánh dấu |
| Tuần | **Yếu.** "This week" đang đóng sẵn; không có danh sách blocker của mình; Briefing chỉ vào được qua banner thứ Hai | **Yếu.** Meeting mode chỉ đọc, cả project, cắt 5/5/8 dòng; Minutes mặc định mọi project, chỉ hôm nay | **Yếu.** Actions liệt kê cả project |
| Tháng | **Chưa có.** Không xem được việc mình đã đóng, tỉ lệ đúng hạn, tổng tải | **Yếu.** Có Gantt và Dashboard theo program; không có tải theo người, không có danh sách deadline đã dời | **Yếu.** Số liệu là của program cha |
| Quý | **Yếu.** Credit ở mục cuối, đang gập, chỉ có ở chế độ không mặc định | **Tạm.** Đổi vai trò tốt. Thấy weight và pool credit nhưng không thấy phân bổ | **Tạm** |
| Năm | **Chưa có.** Không có gì để mang vào buổi đánh giá; Export Excel là kế hoạch project | **Chưa có.** Không có "mỗi người của tôi đã giao gì"; ngày duyệt / người duyệt không hiện, không xuất | **Chưa có** |

## 3. Đối chiếu 35 tiêu chí thị trường

Đạt 10 · Một phần 14 · Chưa 8 · Chưa kiểm 3.

| # | Tiêu chí | Kết quả | Ghi chú |
|---|---|---|---|
| **Member** | | | |
| 1 | Vào thẳng danh sách việc của mình | Đạt | |
| 2 | Gom theo thời gian, tự chuyển nhóm theo ngày | Một phần | Có ở "By urgency"; mặc định "By project" chỉ hiện hôm nay + quá hạn, "This week" đóng (MB-8) |
| 3 | Quá hạn và việc người khác đang chờ mình nằm trên cùng | Một phần | Dải đỏ có quá hạn; thiếu mục bị từ chối ở chế độ mặc định (MB-2) |
| 4 | Việc chưa có hạn nằm trong nhóm có nhãn | Một phần | Rơi vào "Later", không có nhãn riêng |
| 5 | Việc mới giao được đánh dấu "mới" | Chưa | |
| 6 | Mention / phản hồi về một chỗ, tự mình xóa hoặc để sau | Chưa | Dòng mention cắt 55 ký tự, không bấm được, tự tính là đã đọc sau 5 giây (MB-1) |
| 7 | Cập nhật / comment / gửi duyệt ngay trên dòng | Đạt | Trừ Health |
| 8 | Sau khi gửi duyệt vẫn thấy task, người duyệt, thời gian chờ | Đạt | |
| 9 | Bị từ chối → quay lại danh sách kèm lý do | Một phần | Chỉ ở "By urgency" (MB-2) |
| 10 | Xem được credit và việc đã đóng của mình theo kỳ | Chưa | MB-14, MB-15 |
| 11 | Biết ai xem được dữ liệu performance của mình | Chưa | Cần HOD quyết (mục 6) |
| **PM** | | | |
| 12 | Thấy số yêu cầu chờ mình mà không cần bấm | Đạt | Badge trên tab My Work |
| 13 | Mỗi yêu cầu có thời gian chờ; quá ngưỡng thì nổi bật | Đạt | |
| 14 | Duyệt / từ chối (bắt buộc lý do) ngay trên dòng | Đạt | Nhưng thiếu bằng chứng trên dòng (PM-3) |
| 15 | Một bước ra danh sách bị chặn / quá hạn / lâu không cập nhật trong program | Một phần | Dashboard + FOCUS; "no updates" nghĩa là chưa từng cập nhật (PM-1, PM-22) |
| 16 | Tải theo người, một định nghĩa "đang mở" | Chưa (với PM) | Chỉ Owner có (PM-21) |
| 17 | Xuất báo cáo định kỳ từ dữ liệu sẵn có | Một phần | Briefing luôn lấy mọi project; "Completed" tính theo ngày kế hoạch (PM-16) |
| 18 | Lịch sử đổi ngày nhìn thấy được | Một phần | Chỉ trong từng task (PM-23) |
| 19 | Thay người quản lý → việc chờ duyệt chuyển theo, có log | Đạt | Replace person + đổi vai trò |
| **Sub-PM** | | | |
| 20 | Việc của mình và việc của work stream là hai nhóm trên một trang | Chưa | PM-1, PM-27 |
| 21 | Thấy task của work stream lâu không cập nhật | Chưa | |
| 22 | Tạo action trong buổi họp, hiện ngay ở người nhận | Một phần | Tạo được, nhưng Meeting mode chỉ đọc (PM-13) |
| 23 | Nút không được dùng thì ẩn hoặc khóa kèm lý do | Một phần | Work stream bên cạnh: nút biến mất không giải thích; action mở ra mới biết chỉ đọc (PM-12, PM-27) |
| 24 | RAID của work stream có chủ, trạng thái, ngày | Một phần | RAID theo program; mục chờ Owner duyệt bị ẩn với PM (PM-18) |
| **Chung** | | | |
| 25 | Cùng một từ, một màu cho một trạng thái; không chỉ dựa vào màu | Một phần | "milestone" và "task" là một; 3 cách gọi blocker; ✓ nghĩa là "xong" ở action nhưng là "gửi duyệt" ở task (MB-5, PM-8, MB-17) |
| 26 | Nút cha hiện tình trạng xấu nhất của con | Chưa kiểm | |
| 27 | Phạm vi đang chọn luôn nhìn thấy; màn liên project thì ẩn ô chọn | Chưa | Mục 5 |
| 28 | Project và view đang chọn giữ nguyên sau reload | Một phần | Project và kiểu Plan được nhớ; FOCUS thì không |
| 29 | Lưu xong / lưu hỏng đều báo rõ | Đạt | Wave 3 A1 |
| 30 | Từ chối quyền nói bằng lời thường | Đạt | |
| 31 | Danh sách trống nói vì sao và gợi ý bước đầu | Một phần | Member chưa có việc gặp ngõ cụt (MB-20) |
| 32 | Mỗi action / risk / decision có đúng một chủ và một ngày | Chưa kiểm | |
| 33 | Việc đã đóng vẫn đọc được; không xóa cứng | Đạt | |
| 34 | Dùng được ở màn hình 320 px | Chưa kiểm | Cần thử trên điện thoại |
| 35 | Màn đầu ≤ 6 chỉ số, không có nút không dùng được | Một phần | Banner credit pool và số của project trên header My Work (PM-26, MB-19) |

## 4. Phát hiện ưu tiên

Mã trỏ tới phụ lục. "Nhỏ" = vài dòng trong `App.jsx`, không đổi rules, không đổi dữ liệu.

### 4.1 Member

| Mã | Mức | Việc gì | Đề xuất | Cỡ |
|---|---|---|---|---|
| MB-1 | Cao | Mention ở chế độ mặc định: dòng cắt 55 ký tự, không bấm được, 5 giây sau tự mất | Cho bấm vào dòng; chỉ tính đã đọc khi rời My Work hoặc mở mục đó; thêm mục "Mentions (n)" trong thẻ project | Nhỏ |
| MB-2 | Cao | Bị từ chối đóng task không hiện ở chế độ mặc định; trong panel task lý do nằm cuối | Thêm vào dải đỏ của thẻ project, một dòng "✕ Rejected: lý do" trên dòng task, một dòng phía trên nút trong panel | Nhỏ |
| MB-3 | Cao | Người được giao step nhưng không phải PIC của action vẫn thấy ✓, bấm bị từ chối | Chỉ hiện ✓ khi được phép; còn lại hiện "Ask {PIC} to tick this step" | Nhỏ |
| MB-4 / PM-3 | TB | Mọi nút "Open task" ở My Work đẩy sang Outline (work stream đang gập, quay lại thì My Work gập hết) | Bỏ lệnh chuyển sang Outline: panel task mở ngay bên cạnh My Work | 1 dòng |
| MB-5 | TB | Nút ✓ và mục "Completed" ở My Work thực ra là gửi duyệt, không hỏi lại, có gửi Chat | Đổi nhãn "Submit as done" khi người đó không tự đóng được; toast có nút Withdraw | Nhỏ |
| MB-6 | TB | Xin đổi deadline: 3 tên gọi, phải vòng qua Outline; Owner từ chối thì người xin không được báo (lịch sử có lưu nhưng không hiện) | Một tên; mở hộp thoại ngay từ My Work; yêu cầu đang chờ hiện trong "Sent for approval"; hiện kết quả gần nhất | Vừa |
| MB-8 | TB | "This week" đóng sẵn; "Tasks I own" là mục thứ 5 | Tự mở "This week" khi hôm nay không có gì; đưa "My tasks" lên ngay dưới "Needs attention" | Nhỏ |
| MB-14 | Cao (tháng) | Không có danh sách việc mình đã đóng, đúng hạn hay trễ | Mục mới "Closed by me" theo kỳ: task, ngày đóng, người duyệt, đúng hạn / trễ n ngày, cp | Cần spec |
| MB-15 | Cao (quý / năm) | Credit ở mục cuối, đang gập, "all years", không có chi tiết theo task, không chép ra được | Hiện ở cả hai chế độ, chọn năm, liệt kê theo task, nút "Copy as table" | Cần spec |

### 4.2 PM và Sub-PM

| Mã | Mức | Việc gì | Đề xuất | Cỡ |
|---|---|---|---|---|
| PM-1 | Cao | Không có màn "trong program / work stream của tôi, cái gì cần tôi hôm nay" | Một mục trong My Work cho người quản lý: chờ tôi duyệt · chờ ở Sub-PM · quá hạn · blocker đang mở · 7+ ngày không cập nhật · xin đổi deadline | Cần spec |
| PM-2 | Cao | Assignee gắn cờ blocker: người quản lý không nhận được gì (không mục My Work, không badge, không Chat) | Thêm mục "Blocker on {task}" vào Needs attention của người quản lý task đó | Nhỏ |
| PM-3 | Cao | Dòng chờ duyệt không có hạn, cập nhật cuối, deliverables: duyệt mà không có bằng chứng | Thêm một dòng "Due … · trễ n ngày · cập nhật cuối …" | Nhỏ |
| PM-13 | Cao | Meeting mode không chạy được buổi họp của một program: cả project, chỉ đọc, không bấm được, cắt 5/5/8 dòng, không có danh sách quá hạn / sắp tới hạn | Lọc theo phạm vi; thêm "Overdue" và "Due in the next 7 days"; bấm vào dòng thì mở mục đó; hiện "+N more" | Vừa |
| PM-21 | Cao | Người quản lý không xem được tải của người mình (Team là tab của Owner) | Dashboard thêm bảng "By person": đang mở · chờ duyệt · quá hạn · action mở | Nhỏ |
| PM-4 | TB | PM không thấy yêu cầu đang chờ ở Sub-PM cho tới khi quá 3 ngày, dù được quyền duyệt từ đầu | Mục gập "Waiting at Sub-PMs in my programs (n)" | Nhỏ |
| PM-7 | TB | Ai duyệt, lúc nào, bị từ chối mấy lần: có lưu nhưng không hiện trên task | "Approved by … · ngày" dưới nhãn Completed; "Close history (n)" gập được | Nhỏ |
| PM-14 | TB | Meeting mode, Roles nằm trong nút tên "⋯ Export" | Đổi tên "⋯ More"; sắp lại thứ tự | 1 dòng |
| PM-15, PM-16 | TB | Minutes mặc định mọi project, chỉ hôm nay. Briefing luôn mọi project, "Completed this week" tính theo ngày kế hoạch chứ không theo ngày duyệt, blocker cũ bị rơi | Mặc định project hiện tại và 7 ngày; Briefing chọn phạm vi, dùng ngày duyệt | Nhỏ–vừa |
| PM-24 | TB | Export Excel là mẫu import: thiếu contributors, ngày đóng, người duyệt; cột "Latest check-in" trống với dữ liệu hiện tại; ở All projects bấm không có gì xảy ra | Theo phạm vi; thêm các cột đó; báo "Choose a project first" | Nhỏ |
| PM-27 | TB | [Sub-PM] Mọi màn lấy program cha; work stream của mình không được đánh dấu | Mục 5, R6 | Vừa |
| PM-12 | TB | [Sub-PM] Actions liệt kê cả project gồm cả Done / Cancelled | Lọc "My work streams / All", mặc định trạng thái đang mở | Nhỏ |
| PM-6, PM-17 | TB | Outline chỉ tìm theo tên; tạo task mới mất 6 bước; khung ngày của work stream chỉ thấy trong form sửa task | Tìm cả theo PIC; 4 nút lọc nhanh; tạo xong mở luôn panel; hiện ngày trên dòng work stream | Nhỏ |

Các phát hiện mức Thấp (chữ nghĩa, walkthrough dùng chung cho mọi vai, màn trống của member chưa có việc…) ở phụ lục.

## 5. Ô chọn project + FOCUS (C2)

**Hiện trạng** (đã kiểm): FOCUS lọc Mind map, Outline, Gantt, Dashboard, RAID. Bị bỏ qua ở Actions, Decisions, số "% · done/total · overdue" trên header, số trên tab, Meeting mode, Minutes, Briefing, Export Excel. Đổi project thì FOCUS về "All programs". RAID có bộ lọc riêng đè lên FOCUS và kẹt lại khi đổi project. Ở My Work cả hai ô vẫn hiện dù không có tác dụng.

**Quy tắc đề xuất:** ô phạm vi chỉ hiện ở tab mà nó lọc; ở các tab đó, mọi thứ trên màn (danh sách, số đếm, số trên header, và cái gì mở ra từ đó như Meeting mode, Minutes, Excel) đều theo nó; mặc định là "của tôi" và được nhớ theo từng project.

| | Việc | Ghi chú |
|---|---|---|
| R1 | Ở My Work ẩn cả hai ô, ghi "All my projects" | |
| R2 | Áp phạm vi cho Actions, Decisions, số trên header, số trên tab, Meeting mode, Minutes, Excel | Phần lõi |
| R3 | Đổi project → lấy lựa chọn đã nhớ của project đó, không thì program mình quản lý | Phần lõi |
| R4 | Người quản lý mở app → vào project mình có vai trò | |
| R5 | Bỏ bộ lọc riêng của RAID | Phần lõi |
| R6 | Thêm mức work stream cho Sub-PM ("My work stream: …") | |
| R7 | Đổi nhãn "FOCUS" thành "Program" (hoặc "Scope" khi có R6) | |

Câu hỏi của HOD ở lần rà soát trước (2 ô có trùng nhau không): không trùng, nhưng hiện nay ô thứ hai hứa nhiều hơn nó làm. Chuẩn thị trường ở điểm này chỉ có nguyên tắc chung của NN/g (nhất quán; nhìn là biết, không phải nhớ), không có quy định cụ thể về vị trí ô chọn.

## 6. Cần HOD quyết

1. **Ai xem được credit của ai.** Hiện mọi người đọc được project đều thấy phần chia credit của mọi người trong panel task, và Dashboard "Recent activity" hiện cả dòng từ chối đóng task của người khác. Ngày 11/11 chị đã chọn ẩn tab Activity và dòng "Top credit" với non-Owner. Có áp cùng quy tắc ở hai chỗ này không? (MB-16)
2. **PM có được xem credit theo người trong program của mình không?** Nếu có, bảng "By person" (PM-21) thêm được hai cột credit; nếu không, banner credit pool trên Outline nên thu gọn với non-Owner. (PM-26, PM-32)
3. **PM / Sub-PM có được thấy RAID của program mình khi còn chờ Owner duyệt không?** Hiện PM thấy biểu tượng đồng hồ cát nhưng danh sách trống. (PM-18)
4. **Blocker mới:** chỉ hiện trong My Work của người quản lý, hay gửi thêm thẻ Chat? (PM-2)
5. **Action không gắn task** (việc phát sinh trong họp, không thuộc task nào): hiện chỉ Owner tạo được. Giữ nguyên (ghi rõ trong form) hay mở cho PM (đổi rules)? (PM-8)
6. **Hồ sơ của chính mình:** đồng ý cho member xem "Closed by me" và credit theo năm, có chi tiết theo task của chính họ không? Đây là điểm các công cụ performance (Lattice, 15Five) coi là mặc định: người được đánh giá xem được hồ sơ của mình quanh năm và biết ai khác xem được. (MB-14, MB-15, tiêu chí 10–11)

## 7. Lộ trình đề xuất

| Đợt | Nội dung | Vì sao | Điều kiện |
|---|---|---|---|
| **1. Trước onboard** | MB-1, MB-2, MB-3, MB-4 / PM-3, MB-5, MB-8, PM-2, PM-14 | Toàn việc nhỏ; làm cho màn mặc định nói đủ những gì xảy ra với việc của mình | Không cần quyết định nào |
| **2. Phạm vi (C2)** | R1, R2, R3, R5, R7; sau đó R4, R6 | Gỡ nhầm lẫn lớn nhất của người quản lý; là nền cho đợt 3 và 5 | Spec ngắn |
| **3. Góc nhìn quản lý** | PM-1, PM-4, PM-5, PM-7, PM-21, PM-22 | Trả lời "cái gì cần tôi hôm nay" và "ai đang quá tải" | Câu 2, 3, 4 |
| **4. Hồ sơ cá nhân** | MB-14, MB-15, MB-6 | Nhịp tháng / quý / năm của member; minh bạch dữ liệu chấm performance | Câu 1, 6 |
| **5. Họp và báo cáo** | PM-13, PM-15, PM-16, PM-24, MB-11 | Nhịp tuần và tháng của PM; báo cáo lên Owner | Sau đợt 2 |
| **6. Dọn dẹp** | Các mục mức Thấp | | |

Đợt 1 có thể làm ngay thành 2–3 PR nhỏ. Từ đợt 2 trở đi mỗi đợt cần spec ngắn trước (quy tắc của project: không thêm tính năng ngoài spec đã duyệt).

## 8. Giữ nguyên (đang làm tốt)

- Member vào thẳng My Work; "Sent for approval" trên cùng, có người duyệt, số ngày làm việc đã chờ, nút Withdraw.
- "Needs my approval" trên cùng của My Work, duyệt / từ chối tại chỗ, bắt buộc lý do khi từ chối, tự đẩy lên cấp trên sau 3 ngày làm việc.
- Nút theo đúng quyền; lưu bị từ chối thì quay về bản đã lưu; Activity và Chat chỉ ghi sau khi lưu xong.
- Đổi vai trò và Replace person: xác nhận nêu rõ hệ quả, yêu cầu chờ duyệt chuyển theo, có log.
- Gantt gom nhóm, một công thức % ở mọi nơi; tự tải lại khi quay lại tab; glossary có dòng tiếng Việt.
