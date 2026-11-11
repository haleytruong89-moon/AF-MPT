// Glossary of terms shown from the header help menu. Labels stay English; vi is a short helper line.
export const GLOSSARY = [
  { term: 'PIC', en: 'Person in charge of a task. Updates progress and uses "Submit as done" when the work is finished.', vi: 'Người phụ trách chính của task; cập nhật tiến độ và bấm Submit as done khi xong.' },
  { term: 'Assignee', en: 'Same as PIC: the person a task is assigned to. Assignees cannot close their own task directly.', vi: 'Người được giao task (tương đương PIC); không tự đóng task, phải Submit as done để quản lý duyệt.' },
  { term: 'PM', en: 'Manager of a program. Assigns Sub-PMs and approves close requests for tasks in the program.', vi: 'Người quản lý một program; gán Sub-PM và duyệt yêu cầu đóng task trong program.' },
  { term: 'Deputy', en: 'Stands in for the PM of a program and can approve close requests when the PM is away or is the requester.', vi: 'Người thay thế PM của program; duyệt được yêu cầu đóng task khi PM vắng hoặc là người gửi.' },
  { term: 'Sub-PM', en: 'Manager of one work stream. Plans its tasks and approves its close requests.', vi: 'Người quản lý một workstream; lập kế hoạch task và duyệt yêu cầu đóng task của workstream đó.' },
  { term: 'RAID', en: 'Log of Risks, Assumptions, Issues and Dependencies kept per program.', vi: 'Sổ theo dõi Risks (rủi ro), Assumptions (giả định), Issues (vấn đề), Dependencies (phụ thuộc) của từng program.' },
  { term: 'Credit points (cp)', en: 'Points per project, shared among task PICs and contributors when tasks are completed. Used in performance review.', vi: 'Điểm của project, được chia cho PIC và người đóng góp khi task Completed; dùng khi đánh giá performance.' },
  { term: 'Weight', en: 'How much a program, work stream or task counts toward progress and credit.', vi: 'Mức đóng góp của program, workstream hoặc task vào tiến độ và credit.' },
  { term: 'Hard deadline', en: 'A firm date. Missing it counts as a late delivery and raises an overdue alert. Only the Owner can set it.', vi: 'Hạn cứng: trễ là tính trễ cam kết và có cảnh báo quá hạn. Chỉ Owner đặt được.' },
  { term: 'Soft deadline', en: 'A target date (shown as "Soft target"). Missing it is tracked but is less severe than a hard deadline.', vi: 'Hạn mềm (hiện là Soft target): mục tiêu thời gian, trễ vẫn được theo dõi nhưng nhẹ hơn hạn cứng.' },
  { term: 'Submitted', en: 'A task sent for approval. It becomes Completed or Dropped only when the manager approves.', vi: 'Task đã gửi duyệt; chỉ thành Completed/Dropped khi quản lý approve.' },
];
