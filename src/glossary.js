// Glossary of terms shown from the header help menu. Labels stay English; vi is a short helper line.
export const GLOSSARY = [
  { term: 'PIC', en: 'Person in charge of a task. Updates progress and uses "Submit as done" when the work is finished.', vi: 'Người phụ trách chính của task; cập nhật tiến độ và bấm Submit as done khi xong.' },
  { term: 'Assignee', en: 'Same as PIC: the person a task is assigned to. Assignees cannot close their own task directly.', vi: 'Người được giao task (tương đương PIC); không tự đóng task, phải Submit as done để quản lý duyệt.' },
  { term: 'PM', en: 'Manager of a program. Assigns Sub-PMs and approves close requests for tasks in the program.', vi: 'Người quản lý một program; gán Sub-PM và duyệt yêu cầu đóng task trong program.' },
  { term: 'Deputy', en: 'Standing co-manager of a program with the same approval rights as the PM. If the requester is the PM or Deputy, the Owner decides.', vi: 'Đồng quản lý thường trực của program, có quyền duyệt như PM. Nếu người gửi là PM hoặc Deputy thì Owner quyết định.' },
  { term: 'Sub-PM', en: 'Manager of one work stream. Plans its tasks and approves its close requests.', vi: 'Người quản lý một workstream; lập kế hoạch task và duyệt yêu cầu đóng task của workstream đó.' },
  { term: 'RAID', en: 'Log of Risks, Assumptions, Issues and Dependencies kept per program.', vi: 'Sổ theo dõi Risks (rủi ro), Assumptions (giả định), Issues (vấn đề), Dependencies (phụ thuộc) của từng program.' },
  { term: 'Credit points (cp)', en: 'Points per project, shared among task PICs and contributors when tasks are completed. Used in performance review.', vi: 'Điểm của project, được chia cho PIC và người đóng góp khi task Completed; dùng khi đánh giá performance.' },
  { term: 'Weight', en: 'Splits the parent credit among its programs, work streams or tasks (as a %). It does not change progress, which follows status only.', vi: 'Tỷ lệ % chia credit của cấp cha cho các program, workstream hoặc task con. Không ảnh hưởng tiến độ (tiến độ chỉ tính theo status).' },
  { term: 'Hard deadline', en: 'A fixed external date that cannot move. Shows as overdue once passed. Only the Owner sets the deadline type.', vi: 'Hạn cố định từ bên ngoài. Quá ngày là hiện quá hạn. Chỉ Owner đặt loại hạn.' },
  { term: 'Soft deadline', en: 'An internal target date (shown as "Soft target"). Shows as overdue once passed. Only the Owner sets the deadline type.', vi: 'Mốc mục tiêu nội bộ (hiện là Soft target). Quá ngày cũng hiện quá hạn. Chỉ Owner đặt loại hạn.' },
  { term: 'Submitted', en: 'A task sent for approval. It becomes Completed or Dropped only when the manager approves.', vi: 'Task đã gửi duyệt; chỉ thành Completed/Dropped khi quản lý approve.' },
];
