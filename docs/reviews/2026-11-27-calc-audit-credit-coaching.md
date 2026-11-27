# Rà soát tính toán: Credit và Coaching (27/11/2026)

Phạm vi: mọi công thức ra số trong tab **Credits** (gồm Effort, My record, bản chốt năm) và tab **Coaching**. Đọc code tại `main` `b26ff15`, đối chiếu dữ liệu production bằng script **chỉ đọc** ngày 27/11.

Mức: **Cao** = số sai hoặc gây hiểu sai khi dùng chấm performance. **Trung bình** = số đúng theo công thức nhưng công thức dễ gây hiểu nhầm. **Thấp** = sai lệch nhỏ.

## 1. Credit

Công thức hiện tại (`App.jsx computeProjectCredits`, `src/creditYears.js`):
pool project → (trừ phần Project Lead) → chia cho program theo trọng số → chia cho work stream → chia cho task chưa Dropped → chia cho người theo tỷ lệ (PIC 100%, hoặc 70/30, 70/15/15 khi có contributor, hoặc chia tay). Task Completed thì người đó "earned"; theo năm thì tính vào năm được duyệt đóng.

| # | Mức | Phát hiện | Ví dụ / bằng chứng |
|---|---|---|---|
| CR-1 | **Cao (dữ liệu)** | Hầu hết task **không có PIC** → phần cp của task đó không ai nhận được | CRP: 185 / 186 task không PIC, kể cả 25 task đã xong. MA: 38 / 42. Treasury: 7 / 7. AF Lean: 2 / 2. Kết quả: CRP chỉ 10,5 / 100 cp đến được người (gồm 10 cp Project Lead); Treasury 0 / 100 |
| CR-2 | **Cao (code)** | Program / work stream **trống** vẫn được chia phần bằng nhau → phần đó mất | AF 2026 Operation: 8 program không có work stream → 100 cp mất. Key Results: program "Innitiatives" trống lấy 50 cp. Treasury: 2 work stream trống lấy 40 cp. MA: 2 work stream BOD trống lấy 30 cp |
| CR-3 | **Trung bình (code)** | Trọng số chỉ có hiệu lực khi **mọi** anh em cùng cấp đều có trọng số; thiếu một cái → bỏ qua tất cả, chia đều, không báo | CRP: 1 / 19 work stream có trọng số → trọng số đó đang bị bỏ qua. Thêm 1 work stream mới vào nơi đã đặt 60 / 40 → thành 33 / 33 / 33 |
| CR-4 | Thấp | Chia đều làm tròn 2 số lẻ trước khi nhân → tổng lệch | 3 phần: 33,33 × 3 = 99,99%. 7 phần: 14,29 × 7 = 100,03% (phát ra hơn pool) |
| CR-5 | Thấp | Hai cách tính phần **Project Lead**: tab Credits = số task đã xong / tổng task; My Work và banner Outline = % hoàn thành có trọng số (In Progress tính 0,5) | Project 10 task, 2 xong, 4 đang làm: Credits cho lead 20% phần lead; My Work cho 40% |
| CR-6 | Ghi chú thiết kế | Drop một task → cp của nó chia lại cho các task còn lại, kể cả task đã xong năm trước (nếu năm đó chưa chốt) | Đúng theo spec "1 pool cả đời", nhưng nên khóa trọng số + chốt năm trước khi drop hàng loạt |
| CR-7 | Thấp (rủi ro) | Tỷ lệ tự động (70/30…) chỉ tính lại khi sửa PIC / contributor trong panel task; lưu sẵn trong task | Đã kiểm production: **0** task lệch. Rủi ro khi có đường sửa PIC mới mà quên tính lại |

Đã kiểm, **đúng**: năm đóng theo giờ VN; task đóng trước P3.1 tính theo năm credit của project; open task chỉ tính "projected" ở năm hiện tại / Lifetime; Lifetime = các năm cộng lại; bản chốt năm giữ đúng số; Effort đếm task chia sẻ mỗi người một lần; người trùng tên / alias gộp theo danh bạ.

## 2. Coaching

Tab Coaching (`App.jsx computeActivityIndex`): mỗi người có 4 chiều (Delivery 40%, Cadence 30%, Risk honesty 20%, Engagement 10%) và điểm tổng hợp, so với kỳ trước để ra mũi tên xu hướng. Cửa sổ mặc định: action 4 tuần, task 12 tuần.

| # | Mức | Phát hiện | Ví dụ |
|---|---|---|---|
| CO-1 | **Cao** | Task Completed được tính **đúng hạn** dù duyệt đóng sau hạn | Hạn 10/11, duyệt 25/11 → Coaching: on time; My record / PM view (`src/delivery.js`): 15 ngày trễ. Hai màn hình cho hai kết quả |
| CO-2 | **Cao** | Action: "đóng trong kỳ" lấy **ngày tạo** action, không phải ngày xong; action cũ không có ngày xong được coi là xong lúc tạo → luôn đúng hạn | Action tạo 01/09, hạn 15/10, xong 20/11: không nằm trong cửa sổ 4 tuần → bị bỏ qua, dù xong trễ trong kỳ |
| CO-3 | Trung bình | Chiều Delivery chỉ có khi người đó có **≥ 3 action** trong kỳ; người chỉ có task không bao giờ có Delivery → điểm tổng hợp thường "—" | Người có 10 task, 1 action: không có điểm Delivery |
| CO-4 | Trung bình | Task đang **Submitted** (chờ duyệt) có hạn trong kỳ bị tính là chưa xong đúng hạn | Gửi duyệt đúng hạn, PM duyệt chậm 3 ngày → trong 3 ngày đó người làm bị trừ |
| CO-5 | Trung bình | Mũi tên xu hướng so hai cửa sổ **chồng nhau** (task: kỳ trước 24→4 tuần trước, kỳ này 12→0 tuần) và dùng trạng thái hôm nay cho kỳ trước | Xu hướng gần như luôn "flat" hoặc sai chiều; không nên dùng |
| CO-6 | Trung bình | Chỉ tính theo **PIC**; contributor không được tính; task không PIC bị bỏ qua hoàn toàn (kể cả comment / blocker của người khác trên task đó) | Với dữ liệu hiện tại (CR-1) gần như không có mẫu task |
| CO-7 | Thấp | Thang Cadence không khớp ngưỡng màu: 7 ngày không cập nhật (ngưỡng "xanh") cho 75,5 điểm (dưới ngưỡng xanh 80 của điểm tổng hợp) | — |
| CO-8 | Thấp | Banner "cần hỗ trợ" dùng tỷ lệ Delivery chỉ của action; bảng dùng tỷ lệ gộp action + task → banner và bảng có thể nói khác nhau | — |

Đã kiểm, **đúng**: action Cancelled không tính; task Dropped không tính; "xanh nhưng quá hạn" không gắn cho task Submitted; điểm tổng hợp chỉ hiện khi có ≥ 2 chiều đủ mẫu.

## 3. Cần HOD quyết

**Q1 (CR-2) Program / work stream trống**

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Không chia phần cho nhánh trống (khuyến nghị)** | Pool luôn đến được task thật; không mất cp; tự đúng khi thêm task sau | Thêm task vào nhánh trống làm cp các nhánh khác giảm (đúng bản chất) |
| B. Giữ như cũ, hiện dòng "Unallocated cp" | Ít đổi code | Owner phải tự đặt trọng số 0 cho nhánh trống; dễ quên |

Khuyến nghị A, kèm dòng "Unallocated cp" cho phần do task không PIC (CR-1), để thấy ngay chỗ thiếu.

**Q2 (CR-3) Trọng số đặt thiếu**

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Phần đã đặt giữ nguyên, phần còn lại chia đều cho chỗ chưa đặt (khuyến nghị)** | Không bỏ qua ý của Owner; thêm nhánh mới không làm đổi nhánh cũ đã đặt | Tổng đã đặt > 100% thì phải chuẩn hóa (cảnh báo) |
| B. Giữ như cũ + cảnh báo "Weights incomplete" | Ít đổi | Trọng số vẫn bị bỏ qua cho tới khi Owner điền đủ |

**Q3 (CO-4) Task Submitted trong Coaching**

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Không tính cho tới khi duyệt; duyệt rồi thì so ngày gửi với hạn (khuyến nghị)** | Không phạt người làm vì quản lý duyệt chậm; công bằng | Khác định nghĩa "closed on" = ngày duyệt của My record → cần ghi rõ trong Coaching |
| B. Không tính cho tới khi duyệt; so ngày duyệt với hạn | Một định nghĩa duy nhất | Người làm bị trễ vì người duyệt chậm |

## 4. Đề xuất thứ tự

1. **Dữ liệu (HOD / PM, trước mọi thứ):** gán PIC cho task (CRP, MA, Treasury, AF Lean); thêm work stream / task cho AF 2026 Operation, Key Results. Không có PIC thì credit và Coaching đều không có ý nghĩa.
2. **PR credit:** CR-2, CR-3 (theo Q1, Q2), CR-4, CR-5; dòng "Unallocated cp" trong Credits. Test tính tay cho từng trường hợp.
3. **PR coaching:** CO-1, CO-2 dùng chung định nghĩa đúng hạn với `src/delivery.js`; CO-3, CO-4 (theo Q3); CO-5 cửa sổ không chồng nhau hoặc tạm ẩn mũi tên; CO-7, CO-8.
4. Tới khi xong 1–3: Coaching chỉ dùng để **gợi ý hỏi han**, không dùng để chấm điểm; Credits chỉ xem, không chốt năm.
