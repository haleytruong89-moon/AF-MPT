# HANDOVER — AF-MPT (AF Project Tracker)
*Cập nhật: 14/10/2026 · Mục đích: deep review / audit lại toàn bộ app + brainstorm redesign trong hệ sinh thái tool quản lý công việc (cá nhân + phòng)*

## 0. Cách dùng file này
1. Mở chat mới (Claude.ai hoặc Claude Code), dán **seed prompt** ở cuối file vào tin nhắn đầu tiên.
2. Đính kèm lại các file ở **mục 3** (chat mới không có sẵn file).
3. Nói rõ việc cần làm tiếp (gợi ý ở mục 5).

---

## 1. Bối cảnh & mục tiêu

- **App là gì:** AF-MPT là một web app nội bộ để quản lý project/chương trình cho phòng AF tại SmartOSC. Cấu trúc gồm Program → Workstream → Task, kèm Action, Decision, RAID, Credit/weight, My Work, Team Overview, Portfolio, notify Google Chat và xuất Excel/OpenProject. Project mẫu ban đầu là **CRP**.
- **Ai dùng:** user có email `@smartosc.com`. Có một **Workspace Owner** (trưởng nhóm/PM) với quyền duyệt, xem team, credit và portfolio. Các thành viên khác là PIC, contributor hoặc người xem.
- **Production:** https://af-mpt.vercel.app (**không phải** afmpt.smartosc.com). Kiểm tra ngày 14/10/2026: HTTP 200, bundle trùng từng byte với build của commit cuối `8971f1a`.
- **Repo:** `C:\Users\hattt4\projects\afmpt-tracker\afmpt-tracker`, remote `git@github.com:haleytruong89-moon/AF-MPT.git`, chỉ có nhánh `main`.
- **Mục tiêu phiên tới:**
  1. **Deep review / audit** về tính năng, UX, dữ liệu, bảo mật và kiến trúc.
  2. **Brainstorm redesign:** đặt AF-MPT vào **hệ sinh thái** chung với các tool khác của cá nhân và của phòng, để tránh trùng lặp, nối dữ liệu với nhau và chọn đúng vai trò cho app.

## 2. Hiện trạng tổng quan

| Hạng mục | Tình trạng |
|---|---|
| Phát triển | 148 commit từ 29/4 đến 8/6/2026 (tháng 5 có 132 commit). **Không có commit nào từ 8/6 đến nay, khoảng 4 tháng.** Thực tế chỉ một người làm, dưới 3 identity git. |
| Việc cuối hoàn thành | Members 1.3: banner hướng dẫn và panel rà soát "PIC names in this project" (8/6). |
| Deploy | Production chạy đúng bản mới nhất. Push lên GitHub thì Vercel tự deploy; có ít nhất 1 lần deploy prebuilt từ máy local. |
| File chưa commit | `Specs/FEATURES_SPEC_v30_mywork_views.md`, `docs/superpowers/plans/2026-05-19-task-sort-by-start-date.md`, `src/MyWorkViews.jsx` (prototype). **Cả hai tính năng này đã có trong App.jsx**, nên 3 file này chỉ là tài liệu/prototype còn sót. |
| Test / CI | **Không có test, không có CI.** Typecheck pass, nhưng App.jsx là JS nên không được check. Lint báo 6 lỗi và 63 cảnh báo. |
| Kích thước | `src/App.jsx` = **14.811 dòng**, khoảng 104 component, 211 `useState`. Bundle App khoảng 1,0 MB. |

### 2.1 Kiến trúc tóm tắt
- **Stack:** React 18, Vite 5, Firebase 11 (Auth + Firestore), lucide-react, SheetJS (xlsx). Trang tĩnh trên Vercel, **không có backend hay serverless function**.
- **Dữ liệu (Firestore):**
  - `workspaces/main` chứa meta (workspaceOwner, ownershipLog, userPreferences, defaultView…).
  - `workspaces/main/projects/{pid}`: **cả cây project nằm trong 1 document** (programs → workstreams → tasks, actionItems, decisions, RAID, credit, teamMembers, googleChatWebhook…), cộng thêm `memberIds` và `roles`.
  - `workspaces/main/activity/{pid}`: một mảng log, tối đa 500 entry.
  - `workspaces/main/users/{uid}` là danh bạ người dùng. `users/{uid}` lưu tùy chọn riêng và trạng thái walkthrough.
- **Cách lưu:**
  - App gọi `window.storage`, lớp shim (`storage-shim.ts`) chuyển tiếp sang Firestore.
  - Mỗi lần lưu ghi đè **toàn bộ document**, debounce 400 ms.
  - Dữ liệu **chỉ load một lần lúc mở app**, không có realtime.
- **Phân quyền:** có 2 hệ thống song song:
  - (a) Role theo project (owner/operator/member), được Firestore rules thực thi, nhưng **UI không đọc role**.
  - (b) Workspace Owner chỉ kiểm tra ở client.
- **Định danh:** PIC, mentions và My Work khớp theo **chuỗi tên hiển thị**. Members 1.1–1.3 đã thêm bước chuyển email sang tên chuẩn để giảm lệch.

## 3. File cần đính kèm khi mở chat mới

| File | Nội dung | Ghi chú |
|---|---|---|
| `docs/handover/HANDOVER_AFMPT_2026-10-14.md` | File này | Đọc trước |
| `docs/handover/AUDIT_APPENDIX_2026-10-14.md` | Bản kiểm kê tính năng đầy đủ (có trích dẫn file:dòng) và audit kỹ thuật chi tiết | Bằng chứng cho mọi nhận định trong handover |
| `TODAYS_FEATURES_SPEC.md` | Spec v15–v20 (Activity Dashboard, Briefing, Portfolio, Workspace Owner…) | Spec lớn nhất |
| `Specs/FEATURES_SPEC.md`, `Specs/FEATURES_SPEC_v21_to_v29.md`, `Specs/FEATURES_SPEC_v30_my_work.md`, `Specs/FEATURES_SPEC_v30_raid.md`, `Specs/FEATURES_SPEC_v30_mywork_views.md` | Spec theo từng đợt | Chỉ cần nếu muốn đào sâu một module |
| `README.md` | Hướng dẫn setup, mô hình bảo mật v2 | **Một số chỗ đã lỗi thời** (nói có realtime sync, gọi role là "Viewer", cấu trúc file cũ) |
| `firestore.rules` | Luật phân quyền | Cần cho phần audit bảo mật |
| *(tùy chọn)* tài liệu về các tool khác của cá nhân/phòng | Ví dụ OPS_DASHBOARD.md, SKILL_REGISTRY.md, FN_*.md của Ops Hub KT–TC, ảnh chụp các tool đang dùng | **Cần để brainstorm hệ sinh thái** (xem mục 9) |

> Nếu làm tiếp trong **Claude Code** ngay tại repo thì không cần upload, chỉ cần trỏ tới các đường dẫn trên.

## 4. Quyết định

**Đã chốt (theo spec và code):**
- Thuật ngữ trong app (owner/operator/member, PIC, RAID…) giữ tiếng Anh.
- Chỉ cho đăng nhập bằng domain `@smartosc.com`.
- Bỏ menu "Rename project" (v26). Bỏ UI tùy chọn thông báo, vì dễ gây hiểu nhầm khi chưa có backend (v30 P4).
- Chỉ notify Chat cho **Action** (khi tạo mới và khi comment có opt-in). Task, Decision và RAID không notify.
- My Work mặc định ở chế độ "By project". Task được sắp theo ngày bắt đầu, nhưng chỉ khi hiển thị.
- Vẫn cho nhập PIC tự do ("Use as free text"). Phase 2 mới chuyển sang khóa theo email.

**Còn mở, sẽ quyết trong phiên audit/brainstorm:**
1. AF-MPT đóng **vai trò gì** trong hệ sinh thái: nguồn dữ liệu chính (source of truth) cho project của phòng, hay chỉ là lớp tổng hợp và báo cáo trên các tool khác?
2. **Sửa nền tảng hay viết lại:** xử lý 4 rủi ro cấp H trên kiến trúc hiện tại, hay redesign data model (tách sub-collection, realtime, có backend)?
3. Có làm **Members Phase 2** không (khóa PIC theo email, bỏ danh sách team nhập tay)?
4. Google Chat **Stage 2** (DM hoặc ping PIC thật) cần IT cấp Chat App và service account. Có theo đuổi không?
5. Nối với **OpenProject** qua API, hay giữ cách xuất Excel template?
6. Xử lý 3 file chưa commit thế nào (commit vào docs hay xóa) và dọn các file backup/prototype.

## 5. Bước tiếp theo đề xuất (theo thứ tự ưu tiên)
1. **Audit:** dùng mục 6 và file appendix để chấm từng module theo 3 tiêu chí: có ai dùng không, có đúng không, có an toàn không. Nên lấy thêm dữ liệu dùng thực tế (activity log trên Firestore, số project, số user) trước khi kết luận.
2. **Map hệ sinh thái:** liệt kê các tool cá nhân và tool của phòng (mục 9), ghi tool nào đang giữ dữ liệu gì, rồi tìm chỗ trùng lặp và chỗ cần nối.
3. **Brainstorm redesign:** đưa ra 2–3 phương án định vị app (mục 9.3), kèm trade-off, rồi chốt một hướng.
4. **Spec và plan:** viết theo quy trình superpowers (brainstorm → spec → plan → làm theo plan từng task).
5. **Quick win nên làm dù chọn hướng nào:**
   - Chặn leo thang quyền workspace owner.
   - Báo lỗi khi lưu thất bại.
   - Ẩn hoặc khóa thao tác sửa với role member.

## 6. Kết quả audit, những điểm quan trọng

### 6.1 Rủi ro kỹ thuật (H = cao, M = trung bình, L = thấp)
| # | Mức | Vấn đề |
|---|---|---|
| 1 | **H bảo mật** | **Ai trong @smartosc.com cũng tự thành Workspace Owner được.** Lý do: `workspaces/main` cho mọi user trong domain ghi, mà `workspaceOwner` nằm trong đó. Mọi quyền owner (duyệt, xem như người khác, credit, team) chỉ chặn ở client, và còn chấp nhận khớp theo tên hiển thị. |
| 2 | **H dữ liệu** | **Mất cập nhật:** không có realtime, mỗi lần lưu ghi đè cả document, không có version, nên ai lưu sau thì thắng. README nói có "real-time sync", điều này **không đúng** với code hiện tại. |
| 3 | **H dữ liệu** | **Lưu thất bại mà không báo:** lỗi chỉ được ghi `console.warn`. Role member vẫn sửa được trên UI, Firestore từ chối, và người dùng không biết. |
| 4 | **H quy mô** | **Giới hạn 1 MiB mỗi document Firestore:** cả project nằm trong 1 doc. Khi project lớn, việc lưu sẽ hỏng, và kết hợp với #3 thì hỏng mà không ai biết. |
| 5 | M | UI không áp RBAC. Các helper `canEdit`/`isOperator` có sẵn trong `data.ts` nhưng không được dùng. |
| 6 | M | URL webhook Google Chat lưu trong doc project nên mọi member đọc được, và được gọi thẳng từ trình duyệt. |
| 7 | M | Activity log: member, kể cả read-only, ghi đè được lịch sử cũ. |
| 8 | M | Restore JSON ghi đè dữ liệu chung từ phía client. Domain trong rules bị hard-code, lệch với biến env. |
| 9 | M | File monolith 14,8k dòng, không test, JS không được type-check. |
| 10 | M | Hai lớp lưu dữ liệu chạy song song (`data.ts` và shim). MembersModal ghi qua một đường riêng nên có thể ghi đè chéo. |
| 11 | L/M | Định danh theo tên hiển thị: đổi tên hoặc trùng tên sẽ làm sai việc gán người. |
| 12–15 | L | Code chết (`CRPRaid.jsx`, các file backup, `renameCurrentProject`); token màu bị copy ở 4+ file; xlsx không lazy-load; URL deep link hard-code; rules phải dán tay vào console. |

### 6.2 Tính năng: đã có / dở dang / mới có spec
**Đã có (IMPL), 15 module:**
- **Auth:** đăng nhập Google, giới hạn domain.
- **Project:** nhiều project, chế độ All-projects, Program focus, backup/restore JSON.
- **Task:** RAG, deadline cứng/mềm, updates kèm @mention và blocker, Wiki References, multi-PIC, duyệt dời deadline, audit log.
- **View:** Mind map, Outline (kéo-thả), Gantt, Dashboard, Decisions, Actions, Aggregation, Meeting mode, Search Ctrl+K.
- **Action:** sub-task nhiều PIC, comment, xuất template OpenProject, gửi email cho PIC.
- **Decision:** decay badge, ngày review lại.
- **Credit/weight:** đủ engine tính, khóa trọng số, Credit Report.
- **My Work:** hai chế độ xem, sửa trực tiếp, badge.
- **RAID:** risk matrix, quy trình duyệt, mitigation, trend.
- **Team Overview:** kèm "View as".
- **Members 1.1–1.3.**
- **Activity Dashboard, Portfolio, Weekly Briefing, Monday banner, Meeting minutes.**
- **Google Chat Stage 1.**
- **Walkthrough.**

**Dở dang (PARTIAL):**
- Role gating trên UI.
- Realtime sync (đã thụt lùi).
- Mũi tên dependency trên Gantt: có vẽ, nhưng không có UI để nhập `dependencyIds`.
- `project.color` không có chỗ chỉnh.

**Mới có spec hoặc hoãn (SPEC ONLY):**
- RAID Phase 5 (roll-up lên Portfolio, ô "BoD Escalation").
- Backend thông báo (email digest, web push).
- Chat Stage 2.
- Members Phase 2.
- Gộp mitigation vào danh sách action.
- OpenProject API.
- Kanban: không có spec và chưa làm.

### 6.3 Lịch sử phiên bản (rút gọn)
| Mốc | Nội dung |
|---|---|
| v1 → v2 (29/4) | Chuyển sang Firebase, thêm mô hình bảo mật |
| Đầu tháng 5 | Walkthrough, Wiki References |
| v15–v20 (8/5) | Activity Dashboard, Briefing, Portfolio, Workspace Owner |
| v21–v29 (8/5) | Multi-PIC, credit, duyệt deadline |
| v30 (12–19/5) | My Work, Action desk, Team Overview, RAID |
| 19–27/5 | Google Chat |
| 4–8/6 | Members 1.1–1.3 |

Chi tiết xem file appendix.

## 7. Lưu ý & sắc thái
- README và `types.ts` **đã lỗi thời**, không nên coi là nguồn đúng. Nguồn đúng là code cộng với các spec trong `docs/superpowers/specs/`.
- Các file `src/CRP_Project_Tracker_v29_reference.jsx` và `*.backup` bị gitignore, nhưng vẫn nằm trên ổ đĩa và vẫn bị lint quét.
- `src/MyWorkViews.jsx` hard-code `TODAY = 2026-05-08` và `ME = "hattt4"`. Đây chỉ là prototype.
- Mình chưa test được luồng sau khi đăng nhập trên production (cần tài khoản Google). Nhận định về hành vi runtime dựa trên đọc code.
- Chưa có số liệu dùng thực tế (số user, project, tần suất). Cần lấy số trước khi quyết định bỏ hoặc giữ tính năng.

## 8. Cách làm việc / sở thích
- **Ngôn ngữ:** tiếng Việt. Thuật ngữ kỹ thuật và tên tính năng giữ tiếng Anh.
- **Không hỏi quá nhiều:** khi ý định đã rõ thì làm luôn. Không mở đầu và kết thúc bằng một loạt câu hỏi popup.
- **Quy trình build:** superpowers, gồm brainstorming → spec (`docs/superpowers/specs/YYYY-MM-DD-*-design.md`) → plan (`docs/superpowers/plans/`) → subagent-driven development. Commit theo conventional commit (`feat(scope):`, `docs(spec):`, `docs(plan):`).
- Spec tính năng lớn đánh số version (`Specs/FEATURES_SPEC_vXX_*.md`). Prototype UX dùng làm "visual spec", và code phải khớp với prototype.
- Ưu tiên đề xuất có khuyến nghị rõ ràng, không liệt kê mọi phương án.

---

## 9. BRAINSTORM: hệ sinh thái tool quản lý công việc

### 9.1 Những gì đã thấy trong môi trường (**cần user xác nhận** tool nào đang dùng thật)
| Lớp | Tool có dấu hiệu sử dụng | Quan hệ với AF-MPT hiện tại |
|---|---|---|
| Giao tiếp | **Google Chat** (đã nối webhook), Gmail (compose link) | AF-MPT gửi ra Chat một chiều |
| Lịch | Google Calendar | **Chưa nối**: deadline, review date và meeting không lên lịch |
| Tài liệu / dữ liệu | Google Drive, Sheets, Docs; Excel | Import/export Excel thủ công; Wiki References chỉ là link |
| PM của công ty | **OpenProject** (`openProjectCode`, template xuất) | Đẩy action bằng Excel, không đồng bộ ngược |
| Kế toán / tài chính | Xero; Ops Hub KT–TC (OPS_DASHBOARD.md, FN_*.md, SKILL_REGISTRY.md, các skill FCT/VAT/treasury) | **Không liên quan** dù cùng phòng |
| Connector đã thêm nhưng chưa xác thực | Asana, Atlassian (Jira/Confluence), Notion, Slack, Linear, monday.com, TickTick, Miro | Chưa rõ cái nào phòng thật sự dùng |
| Việc cá nhân | Có thể là TickTick, Calendar, My Work trong AF-MPT | My Work hiện chỉ nhìn được dữ liệu bên trong AF-MPT |

### 9.2 Câu hỏi cần trả lời đầu phiên brainstorm
1. Việc cá nhân hằng ngày đang nằm ở đâu: TickTick, Calendar, Gmail hay My Work? Mỗi sáng mở cái gì đầu tiên?
2. Phòng đang quản lý project chính thức ở đâu: OpenProject, Sheets hay AF-MPT? Ai cần nhìn báo cáo (BOD, trưởng phòng)?
3. Ops Hub KT–TC (việc định kỳ: kê khai, đóng sổ, treasury) có nên chung "bảng việc" với AF-MPT không?
4. Bao nhiêu người dùng AF-MPT thật sự trong 4 tháng qua? Tính năng nào dùng nhiều, tính năng nào không ai đụng (credit, portfolio, activity index…)?
5. Ràng buộc IT: có được tạo Chat App, service account, Cloud Functions không? Có bắt buộc dùng OpenProject không?

### 9.3 Giả thuyết định vị, để chấm điểm trong phiên tới
| Phương án | Ý tưởng | Ưu | Nhược |
|---|---|---|---|
| **A. Hub trung tâm** | AF-MPT là nguồn dữ liệu chính cho project và việc của phòng; các tool khác (Calendar, Chat, OpenProject, Sheets) chỉ là đầu ra hoặc đầu vào | Một nơi duy nhất, tận dụng hết tính năng đã build | Phải sửa nền tảng (4 rủi ro H, document 1 MiB, realtime, có backend); dễ phình to |
| **B. Lớp điều phối & báo cáo** | Dữ liệu việc giữ ở tool chuẩn (OpenProject/Sheets/Calendar). AF-MPT chỉ giữ phần riêng (RAID, Decision, Credit, Briefing, My Work tổng hợp) và đồng bộ qua API | Tránh trùng lặp, nhẹ hơn | Cần làm integration và backend; phụ thuộc API của tool khác |
| **C. Thu gọn** | Giữ phần lõi được dùng nhiều (My Work, Action, RAID, Decision, Briefing). Cắt hoặc ẩn module ít dùng. Chuyển các nhu cầu khác sang tool có sẵn | Ít bảo trì nhất, hợp với một người dev | Mất các tính năng đã đầu tư |

**Nối hệ sinh thái nhanh, đáng cân nhắc dù chọn phương án nào:**
- Đẩy deadline và review date lên **Google Calendar**.
- **Digest My Work** hằng ngày gửi Chat hoặc Gmail.
- Weekly Briefing xuất thẳng ra **Google Docs**.
- Gắn Drive file vào Wiki References.
- Cổng một chiều từ Ops Hub sang My Work cho các việc định kỳ.

---

## 10. Phần làm thêm trong phiên này
Hai báo cáo chi tiết (kiểm kê tính năng và audit kỹ thuật) do agent tạo trong phiên 14/10/2026. Chúng chỉ có trong chat, nên đã được lưu nguyên vào **`docs/handover/AUDIT_APPENDIX_2026-10-14.md`**. Nhớ đính kèm file này.

---

## SEED PROMPT (dán vào chat mới)

```
Tiếp tục dự án: AF-MPT (AF Project Tracker, https://af-mpt.vercel.app). Đính kèm:
1. HANDOVER_AFMPT_2026-10-14.md: đọc trước. Gồm bối cảnh, hiện trạng, rủi ro, quyết định đã chốt và còn mở, cách làm việc.
2. AUDIT_APPENDIX_2026-10-14.md: kiểm kê đầy đủ tính năng (trích file:dòng) và audit kỹ thuật.
3. [tùy chọn] Specs / README / firestore.rules / tài liệu các tool khác của cá nhân và phòng.

Cách làm việc: trả lời bằng tiếng Việt, giữ thuật ngữ tiếng Anh; ý đã rõ thì làm luôn, không hỏi dồn dập;
đưa khuyến nghị rõ ràng thay vì liệt kê mọi phương án; dám phản biện; build theo quy trình
brainstorm → spec → plan → implement.

Việc tiếp theo: (1) Deep review / audit lại app theo mục 6 của handover, chấm từng module theo
"có dùng / có đúng / có an toàn"; (2) brainstorm định vị AF-MPT trong hệ sinh thái tool cá nhân + phòng
theo mục 9 (bắt đầu bằng các câu hỏi 9.2, rồi chấm 3 phương án A/B/C), ra một bản design hướng mới.
```
